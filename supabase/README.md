# Hangar Cloud Backend (Supabase)

Toto je první cloud vrstva pro Project Hangar: online databáze + email/password účty.

## Cíl

Desktop Hangar zůstává hlavní aplikace, ale data se mohou synchronizovat do cloudu:

- uživatelský profil,
- web/projekt metadata,
- textové soubory projektu,
- GitHub propojení,
- AI connection metadata,
- commit historie.

Supabase řeší:

- email/password autentizaci,
- PostgreSQL databázi,
- Row Level Security (každý uživatel vidí jen svá data),
- zdarma použitelný start pro MVP.

## Co je hotové

`migrations/0001_initial_cloud_schema.sql` obsahuje:

- `profiles`
- `projects`
- `project_files`
- `ai_connections`
- `commits`
- `sync_events`
- RLS policies pro izolaci podle `auth.uid()`
- trigger pro automatické vytvoření profilu po signupu

## Jak založit Supabase projekt

1. Vytvoř projekt na [supabase.com](https://supabase.com).
2. V Supabase dashboardu otevři SQL editor.
3. Spusť obsah `migrations/0001_initial_cloud_schema.sql`.
4. V Auth nastavení nech zapnutý Email provider.
5. Pro lokální Hangar budeš potřebovat:

```txt
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
```

Později tyto hodnoty přidáme do nastavení Hangaru.

## Důležitá bezpečnostní pravidla

- Desktop appka používá pouze anon key + user session JWT.
- Service role key nikdy nepůjde do desktop appky.
- RLS policies hlídají, že uživatel čte/zapisuje jen vlastní řádky.
- API klíče AI providerů se v cloud DB neukládají plaintext. Pro MVP zůstávají lokálně v šifrovaném trezoru; cloud sync klíčů přidáme později až s pořádným šifrováním.

## Co bude další krok

1. Přidat do Hangaru cloud auth UI:
   - registrace email/heslo,
   - login,
   - logout,
   - uložení session lokálně.
2. Přidat cloud sync:
   - upload lokálního webu/projektu do Supabase,
   - stažení projektů ze Supabase,
   - indikace cloud statusu.
3. Až potom řešit GitHub webhooky přes Supabase Edge Function nebo samostatný `sync-server/`.
