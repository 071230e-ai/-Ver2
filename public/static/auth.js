// Authentication Management
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('meishi_auth_token');
        this.init();
    }

    init() {
        // Check if user is already authenticated on page load
        if (this.token) {
            this.validateToken();
        } else {
            this.showLoginScreen();
        }

        // Setup login form handler
        this.setupLoginForm();
        
        // Setup logout handler
        this.setupLogoutHandler();
    }

    async validateToken() {
        try {
            const response = await axios.get('/api/auth/validate', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.data.valid) {
                this.showMainApp();
            } else {
                this.logout();
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            this.logout();
        }
    }

    setupLoginForm() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.login();
            });
        }
    }

    setupLogoutHandler() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    async login() {
        const passwordInput = document.getElementById('password');
        const loginError = document.getElementById('login-error');
        const password = passwordInput.value;

        if (!password) {
            this.showLoginError('パスワードを入力してください');
            return;
        }

        try {
            const response = await axios.post('/api/auth/login', {
                password: password
            });

            if (response.data.success) {
                this.token = response.data.token;
                localStorage.setItem('meishi_auth_token', this.token);
                this.showMainApp();
                passwordInput.value = '';
                this.hideLoginError();
            }
        } catch (error) {
            console.error('Login failed:', error);
            if (error.response && error.response.status === 401) {
                this.showLoginError('パスワードが間違っています');
            } else {
                this.showLoginError('ログインに失敗しました。もう一度お試しください。');
            }
        }
    }

    logout() {
        this.token = null;
        localStorage.removeItem('meishi_auth_token');
        this.showLoginScreen();
    }

    showLoginScreen() {
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');
        
        if (loginScreen) loginScreen.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
    }

    showMainApp() {
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
    }

    showLoginError(message) {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.querySelector('p').textContent = message;
            loginError.classList.remove('hidden');
        }
    }

    hideLoginError() {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.classList.add('hidden');
        }
    }

    // Get current auth token for API requests
    getAuthHeaders() {
        if (this.token) {
            return {
                'Authorization': `Bearer ${this.token}`
            };
        }
        return {};
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

// Axios interceptor to add auth headers to all requests
axios.interceptors.request.use((config) => {
    if (window.authManager && window.authManager.token) {
        config.headers = {
            ...config.headers,
            ...window.authManager.getAuthHeaders()
        };
    }
    return config;
});

// Axios interceptor to handle 401 responses (unauthorized)
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            if (window.authManager) {
                window.authManager.logout();
            }
        }
        return Promise.reject(error);
    }
);