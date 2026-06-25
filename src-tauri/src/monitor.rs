// Monitoring webu: dostupnost (HTTP status), latence a expirace SSL certifikatu.
// Cista Rust implementace (rustls), bez systemovych zavislosti.

use chrono::{TimeZone, Utc};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct MonitorResult {
    pub ok: bool,
    pub status: i64,
    pub latency_ms: i64,
    pub error: Option<String>,
    pub ssl_expires_at: Option<String>,
}

struct Target {
    https: bool,
    host: String,
    port: u16,
    path: String,
}

/// Velmi jednoduchy parser URL (bez extra zavislosti).
fn parse_url(input: &str) -> Result<Target, String> {
    let trimmed = input.trim();
    let (https, rest) = if let Some(r) = trimmed.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = trimmed.strip_prefix("http://") {
        (false, r)
    } else {
        (true, trimmed) // bez schematu predpokladame https
    };
    if rest.is_empty() {
        return Err("prázdná URL".into());
    }
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse().unwrap_or(if https { 443 } else { 80 })),
        None => (authority.to_string(), if https { 443 } else { 80 }),
    };
    if host.is_empty() {
        return Err("chybí doména".into());
    }
    Ok(Target {
        https,
        host,
        port,
        path: path.to_string(),
    })
}

const TIMEOUT: Duration = Duration::from_secs(10);

fn connect(host: &str, port: u16) -> Result<TcpStream, String> {
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("DNS: {e}"))?
        .next()
        .ok_or_else(|| "doménu nelze přeložit".to_string())?;
    let sock = TcpStream::connect_timeout(&addr, TIMEOUT).map_err(|e| format!("spojení: {e}"))?;
    sock.set_read_timeout(Some(TIMEOUT)).ok();
    sock.set_write_timeout(Some(TIMEOUT)).ok();
    Ok(sock)
}

/// Z prvni radky HTTP odpovedi ("HTTP/1.1 200 OK") vytahne status kod.
fn parse_status(buf: &[u8]) -> i64 {
    let head = String::from_utf8_lossy(buf);
    head.lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse::<i64>().ok())
        .unwrap_or(0)
}

fn http_request(t: &Target) -> String {
    format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: ProjectHangar/1.0\r\nConnection: close\r\nAccept: */*\r\n\r\n",
        t.path, t.host
    )
}

fn check_http(t: &Target) -> MonitorResult {
    let start = Instant::now();
    let res = (|| -> Result<i64, String> {
        let mut sock = connect(&t.host, t.port)?;
        sock.write_all(http_request(t).as_bytes())
            .map_err(|e| format!("zápis: {e}"))?;
        let mut buf = [0u8; 1024];
        let n = sock.read(&mut buf).map_err(|e| format!("čtení: {e}"))?;
        Ok(parse_status(&buf[..n]))
    })();
    let latency = start.elapsed().as_millis() as i64;
    match res {
        Ok(status) => MonitorResult {
            ok: (200..400).contains(&status),
            status,
            latency_ms: latency,
            error: None,
            ssl_expires_at: None,
        },
        Err(e) => MonitorResult {
            ok: false,
            status: 0,
            latency_ms: latency,
            error: Some(e),
            ssl_expires_at: None,
        },
    }
}

fn tls_config() -> Arc<rustls::ClientConfig> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

/// Z DER certifikatu precte konec platnosti jako ISO datum.
fn cert_not_after(der: &[u8]) -> Option<String> {
    let (_, cert) = x509_parser::parse_x509_certificate(der).ok()?;
    let ts = cert.validity().not_after.timestamp();
    Utc.timestamp_opt(ts, 0).single().map(|dt| dt.to_rfc3339())
}

fn check_https(t: &Target) -> MonitorResult {
    let start = Instant::now();
    let server_name = match rustls::pki_types::ServerName::try_from(t.host.clone()) {
        Ok(s) => s,
        Err(_) => {
            return MonitorResult {
                ok: false,
                status: 0,
                latency_ms: 0,
                error: Some("neplatné jméno hosta".into()),
                ssl_expires_at: None,
            }
        }
    };

    let res = (|| -> Result<(i64, Option<String>), String> {
        let mut conn = rustls::ClientConnection::new(tls_config(), server_name)
            .map_err(|e| format!("TLS init: {e}"))?;
        let mut sock = connect(&t.host, t.port)?;
        let status = {
            let mut tls = rustls::Stream::new(&mut conn, &mut sock);
            tls.write_all(http_request(t).as_bytes())
                .map_err(|e| format!("TLS handshake/zápis: {e}"))?;
            let mut buf = [0u8; 1024];
            // close_notify muze vratit chybu az po datech – tu tolerujeme.
            let n = tls.read(&mut buf).unwrap_or(0);
            parse_status(&buf[..n])
        };
        let ssl = conn
            .peer_certificates()
            .and_then(|certs| certs.first())
            .and_then(|c| cert_not_after(c.as_ref()));
        Ok((status, ssl))
    })();

    let latency = start.elapsed().as_millis() as i64;
    match res {
        Ok((status, ssl)) => MonitorResult {
            ok: (200..400).contains(&status),
            status,
            latency_ms: latency,
            error: if (200..400).contains(&status) {
                None
            } else {
                Some(format!("HTTP {status}"))
            },
            ssl_expires_at: ssl,
        },
        Err(e) => MonitorResult {
            ok: false,
            status: 0,
            latency_ms: latency,
            error: Some(e),
            ssl_expires_at: None,
        },
    }
}

/// Zkontroluje jeden cil. Pri chybe parsovani vraci chybovy vysledek.
pub fn check(url: &str) -> MonitorResult {
    match parse_url(url) {
        Ok(t) if t.https => check_https(&t),
        Ok(t) => check_http(&t),
        Err(e) => MonitorResult {
            ok: false,
            status: 0,
            latency_ms: 0,
            error: Some(e),
            ssl_expires_at: None,
        },
    }
}
