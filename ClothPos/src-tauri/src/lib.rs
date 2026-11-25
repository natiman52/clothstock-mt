mod background_sync;
mod commands;
mod db;
mod error;
mod models;
mod onboarding;
mod sync;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::open_and_migrate(&app.handle())?;
            app.manage(DbState {
                conn: Mutex::new(conn),
            });
            let runtime = background_sync::SyncRuntime::new();
            app.manage(runtime);
            background_sync::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_initialized,
            commands::complete_onboarding,
            commands::get_settings,
            commands::save_settings,
            commands::login_server,
            commands::logout_server,
            commands::seed_demo_catalog,
            commands::lookup_variant,
            commands::search_catalog,
            commands::browse_products,
            commands::browse_variants,
            commands::browse_categories,
            commands::get_cart,
            commands::cart_add,
            commands::cart_update_qty,
            commands::cart_remove,
            commands::cart_clear,
            commands::checkout,
            commands::list_sales,
            commands::get_sale,
            commands::get_sync_status,
            commands::sync_now,
            commands::export_sync_status,
            commands::import_server_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ClothPos");
}
