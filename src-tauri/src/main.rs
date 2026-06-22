// Skryje konzolove okno na Windows v release buildu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    project_hangar_lib::run()
}
