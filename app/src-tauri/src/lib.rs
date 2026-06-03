use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create daily_logs",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "goals persona + context_json",
            sql: include_str!("../migrations/002_goal_persona.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "profiles",
            sql: include_str!("../migrations/003_profiles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "sync foundation",
            sql: include_str!("../migrations/004_sync_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "garmin raw imports and health metrics",
            sql: include_str!("../migrations/005_garmin_imports.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "weekly reviews",
            sql: include_str!("../migrations/006_weekly_reviews.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:twelvewy.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
