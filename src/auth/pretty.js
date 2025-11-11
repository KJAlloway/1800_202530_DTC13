// auth/pretty.js
export function prettyAuthError(err) {
    const code = err?.code || '';
    if (code.includes('invalid-email')) return 'Please enter a valid email.';
    if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
    if (code.includes('email-already-in-use')) return 'That email is already registered. Try logging in.';
    if (code.includes('wrong-password')) return 'Incorrect password.';
    if (code.includes('user-not-found')) return 'No account found with that email.';
    return 'Authentication error. Please try again.';
}