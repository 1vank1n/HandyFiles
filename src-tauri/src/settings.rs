use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub selected_model: Option<String>,
    pub selected_language: String,
    pub translate_to_english: bool,
    pub model_unload_timeout_minutes: u32,
    pub output_directory: Option<String>,
    pub auto_save: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            selected_model: None,
            selected_language: "ru".to_string(),
            translate_to_english: false,
            model_unload_timeout_minutes: 10,
            output_directory: None,
            auto_save: false,
        }
    }
}
