// auth.js
const SUPABASE_URL = 'https://mqfeisvvyrzeauayyilv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZmVpc3Z2eXJ6ZWF1YXl5aWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDE1NDcsImV4cCI6MjA4OTc3NzU0N30.7Tj1OUuEZmd5oqdVNACcG4eXQ13MBCgKmaJ43nJitdQ';

if (!window._supabaseClient) {
    window._supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ========== DOM Elements ==========
const sessionSection = document.getElementById('session-section');
const profilePhoto = document.getElementById('profile-photo');
const sessionUsernameSpan = document.getElementById('session-username');
const useSessionBtn = document.getElementById('use-session-btn');
const newAccountBtn = document.getElementById('new-account-btn');
const tabsContainer = document.getElementById('tabs-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const resetForm = document.getElementById('reset-form');
const tabBtns = document.querySelectorAll('.tab-btn');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const resetBtn = document.getElementById('reset-btn');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const resetError = document.getElementById('reset-error');
const resetSuccess = document.getElementById('reset-success');
const rememberCheckbox = document.getElementById('remember-me');
const forgotLink = document.getElementById('forgot-password-link');
const backToLoginLink = document.getElementById('back-to-login-link');
const menuBtn = document.getElementById('menu-btn');
const dropdownMenu = document.getElementById('dropdown-menu');
const notification = document.getElementById('notification');
const notificationMessage = document.getElementById('notification-message');
const closeNotif = document.getElementById('close-notif');
const loader = document.getElementById('loader');
const appName = document.getElementById('app-name');

let currentSessionUser = null;

// ========== Notification ==========
function showNotification(message, type = 'info') {
    notification.className = 'notification';
    notification.classList.add(type);
    notificationMessage.textContent = message;
    notification.style.display = 'flex';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

closeNotif.addEventListener('click', () => {
    notification.style.display = 'none';
});

// ========== Loader ==========
function showLoader() {
    loader.style.display = 'inline-block';
}

function hideLoader() {
    loader.style.display = 'none';
}

function setButtonLoading(button, isLoading, originalText = null) {
    if (isLoading) {
        button.disabled = true;
        const originalTextValue = originalText || button.textContent;
        button.setAttribute('data-original-text', originalTextValue);
        const loaderSpan = document.createElement('div');
        loaderSpan.className = 'loader-megane';
        loaderSpan.id = 'temp-loader';
        button.innerHTML = '';
        button.appendChild(loaderSpan);
        const span = document.createElement('span');
        span.className = 'btn-text';
        span.textContent = originalTextValue;
        button.appendChild(span);
        button.classList.add('loading');
    } else {
        button.disabled = false;
        const originalTextValue = button.getAttribute('data-original-text');
        if (originalTextValue) {
            button.innerHTML = originalTextValue;
        }
        button.classList.remove('loading');
    }
}

// ========== UI Helpers ==========
function showForm(formToShow) {
    loginForm.classList.remove('active');
    registerForm.classList.remove('active');
    resetForm.classList.remove('active');
    
    if (formToShow === 'login') {
        loginForm.classList.add('active');
        tabsContainer.style.display = 'flex';
    } else if (formToShow === 'register') {
        registerForm.classList.add('active');
        tabsContainer.style.display = 'flex';
    } else if (formToShow === 'reset') {
        resetForm.classList.add('active');
        tabsContainer.style.display = 'flex';
        if (resetError) resetError.textContent = '';
        if (resetSuccess) resetSuccess.style.display = 'none';
        const resetEmail = document.getElementById('reset-email');
        if (resetEmail) resetEmail.value = '';
    }
}

function showSessionSection(user) {
    sessionSection.style.display = 'block';
    tabsContainer.style.display = 'none';
    loginForm.classList.remove('active');
    registerForm.classList.remove('active');
    resetForm.classList.remove('active');
    
    sessionUsernameSpan.textContent = user.username || user.email;
    const initial = (user.username || user.email).charAt(0).toUpperCase();
    if (profilePhoto) {
        profilePhoto.innerHTML = `<i class="fas fa-user-circle"></i>`;
    }
    currentSessionUser = user;
}

function hideSessionSection() {
    sessionSection.style.display = 'none';
    tabsContainer.style.display = 'flex';
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    resetForm.classList.remove('active');
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === 'login') btn.classList.add('active');
    });
}

// ========== Onglets ==========
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (tab === 'login') showForm('login');
        else showForm('register');
    });
});

// ========== Menu trois points ==========
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!menuBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove('show');
    }
});

// ========== Mot de passe oublié ==========
forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    showForm('reset');
});

backToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    showForm('login');
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === 'login') btn.classList.add('active');
    });
});

resetBtn.addEventListener('click', async () => {
    const email = document.getElementById('reset-email').value.trim();
    if (resetError) resetError.textContent = '';
    if (resetSuccess) resetSuccess.style.display = 'none';
    
    if (!email) {
        showNotification('Veuillez saisir votre email', 'error');
        return;
    }
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Email invalide', 'error');
        return;
    }
    
    setButtonLoading(resetBtn, true, 'ENVOYER');
    showLoader();
    
    const redirectUrl = `${window.location.origin}/auth.html`;
    const { error } = await window._supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    
    setButtonLoading(resetBtn, false);
    hideLoader();
    
    if (error) {
        showNotification(error.message, 'error');
        return;
    }
    showNotification('Email de réinitialisation envoyé', 'success');
    document.getElementById('reset-email').value = '';
});

// ========== Connexion ==========
loginBtn.addEventListener('click', async () => {
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!identifier || !password) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    setButtonLoading(loginBtn, true, 'SE CONNECTER');
    showLoader();
    
    let email = identifier;
    if (!identifier.includes('@')) {
        const { data: userData, error: userError } = await window._supabaseClient
            .from('users')
            .select('email')
            .eq('username', identifier)
            .single();
        if (userError || !userData) {
            setButtonLoading(loginBtn, false);
            hideLoader();
            showNotification('Utilisateur non trouvé', 'error');
            return;
        }
        email = userData.email;
    }
    
    const { data, error } = await window._supabaseClient.auth.signInWithPassword({ email, password });
    
    setButtonLoading(loginBtn, false);
    hideLoader();
    
    if (error) {
        showNotification(error.message === 'Invalid login credentials' 
            ? 'Email ou mot de passe incorrect' 
            : error.message, 'error');
        return;
    }
    
    if (data.session) {
        if (rememberCheckbox.checked) localStorage.setItem('persist_session', 'true');
        else localStorage.setItem('persist_session', 'false');
        localStorage.setItem('access_token', data.session.access_token);
        showNotification('Connexion réussie', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    }
});

// ========== Inscription ==========
registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const phone = document.getElementById('register-phone').value.trim();
    
    if (!username || !email || !password || !confirm) {
        showNotification('Tous les champs obligatoires doivent être remplis', 'error');
        return;
    }
    if (username.length < 3) {
        showNotification('Nom d\'utilisateur : minimum 3 caractères', 'error');
        return;
    }
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Email invalide', 'error');
        return;
    }
    if (password.length < 6) {
        showNotification('Mot de passe : minimum 6 caractères', 'error');
        return;
    }
    if (password !== confirm) {
        showNotification('Les mots de passe ne correspondent pas', 'error');
        return;
    }
    
    setButtonLoading(registerBtn, true, 'S\'INSCRIRE');
    showLoader();
    
    const { data: existingUser } = await window._supabaseClient
        .from('users')
        .select('username')
        .eq('username', username)
        .single();
    
    if (existingUser) {
        setButtonLoading(registerBtn, false);
        hideLoader();
        showNotification('Nom d\'utilisateur déjà pris', 'error');
        return;
    }
    
    const { data: authData, error: signUpError } = await window._supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username, phone: phone || null } }
    });
    
    setButtonLoading(registerBtn, false);
    hideLoader();
    
    if (signUpError) {
        showNotification(signUpError.message, 'error');
        return;
    }
    
    if (authData.user) {
        await window._supabaseClient
            .from('users')
            .insert({
                id: authData.user.id,
                username,
                email,
                phone: phone || null,
                avatar_url: null,
                about: 'Disponible',
                created_at: new Date().toISOString(),
                privacy_last_seen: 'Tous',
                privacy_photo: 'Tous',
                privacy_about: 'Tous',
                privacy_online: 'Tous',
                read_receipts: true
            });
        
        showNotification('Inscription réussie ! Vérifiez votre email et connectez-vous.', 'success');
        
        setTimeout(() => {
            document.querySelector('.tab-btn[data-tab="login"]').click();
            showNotification('Un email de confirmation vous a été envoyé', 'info');
        }, 2000);
    }
});

// ========== Session existante ==========
useSessionBtn.addEventListener('click', async () => {
    if (currentSessionUser) {
        showNotification('Connexion en cours', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    }
});

newAccountBtn.addEventListener('click', () => {
    hideSessionSection();
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === 'register') btn.classList.add('active');
    });
    showForm('register');
});

async function checkExistingSession() {
    const persist = localStorage.getItem('persist_session');
    const token = localStorage.getItem('access_token');
    
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
        showForm('login');
        showNotification('Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.', 'success');
        window.location.hash = '';
        return;
    }
    
    if (persist === 'true' && token) {
        const { data: { user }, error } = await window._supabaseClient.auth.getUser();
        if (!error && user) {
            const { data: userData } = await window._supabaseClient
                .from('users')
                .select('username')
                .eq('id', user.id)
                .single();
            const displayUser = { id: user.id, email: user.email, username: userData?.username || user.email };
            showSessionSection(displayUser);
            return;
        }
    }
    hideSessionSection();
}

// ========== Initialisation ==========
window.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
});