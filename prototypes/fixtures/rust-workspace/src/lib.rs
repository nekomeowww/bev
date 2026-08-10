mod model;

pub use model::User;

/// Returns a stable greeting for the supplied user.
pub fn greeting(user: &User) -> String {
    format!("Hello, {}", user.name())
}
