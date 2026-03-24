// recherche.js

// ========== SUPABASE CLIENT ==========
const SUPABASE_URL = 'https://mqfeisvvyrzeauayyilv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZmVpc3Z2eXJ6ZWF1YXl5aWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDE1NDcsImV4cCI6MjA4OTc3NzU0N30.7Tj1OUuEZmd5oqdVNACcG4eXQ13MBCgKmaJ43nJitdQ';

if (!window._supabaseClient) {
    window._supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const supabaseClient = window._supabaseClient;

// ========== ÉTAT GLOBAL ==========
let currentUser = null;
let currentTab = 'contacts';
let searchTimeout = null;
let blockedUntil = new Map(); // userId -> timestamp

// ========== DOM ELEMENTS ==========
const searchInput = document.getElementById('search-input');
const tabsContainer = document.querySelector('.tabs-container');
const tabBtns = document.querySelectorAll('.tab-btn');
const contentContainer = document.getElementById('content-container');
const bottomNav = document.getElementById('bottom-nav');

// ========== NOTIFICATION ==========
function showNotification(message, type = 'info') {
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notif-close">×</button>
    `;
    notification.style.display = 'flex';
    
    const closeBtn = notification.querySelector('.notif-close');
    closeBtn.onclick = () => {
        notification.style.display = 'none';
    };
    
    setTimeout(() => {
        if (notification) notification.style.display = 'none';
    }, 4000);
}

// ========== CHARGER UTILISATEUR ACTUEL ==========
async function loadCurrentUser() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        window.location.href = 'auth.html';
        return null;
    }
    
    const { data: userData } = await supabaseClient
        .from('users')
        .select('id, username, avatar_url')
        .eq('id', user.id)
        .single();
    
    currentUser = userData || { id: user.id, username: user.email };
    return currentUser;
}

// ========== RECHERCHE UTILISATEURS ==========
async function searchUsers(query) {
    if (!query || query.length < 2) return [];
    
    const { data, error } = await supabaseClient
        .from('users')
        .select('id, username, avatar_url, about')
        .ilike('username', `%${query}%`)
        .neq('id', currentUser.id)
        .limit(20);
    
    if (error) {
        showNotification('Erreur de recherche', 'error');
        return [];
    }
    
    return data;
}

// ========== GESTION DES INVITATIONS ==========
async function sendInvitation(receiverId) {
    // Vérifier blocage
    const blockedTime = blockedUntil.get(receiverId);
    if (blockedTime && Date.now() < blockedTime) {
        const minutesLeft = Math.ceil((blockedTime - Date.now()) / 60000);
        showNotification(`Bloqué pour ${minutesLeft} minute(s)`, 'error');
        return false;
    }
    
    // Vérifier invitation existante
    const { data: existing } = await supabaseClient
        .from('invitations')
        .select('status')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUser.id})`)
        .single();
    
    if (existing) {
        if (existing.status === 'pending') {
            showNotification('Invitation déjà envoyée', 'info');
        } else if (existing.status === 'accepted') {
            showNotification('Vous êtes déjà contact', 'info');
        } else if (existing.status === 'rejected') {
            showNotification('Invitation refusée', 'error');
        }
        return false;
    }
    
    const { error } = await supabaseClient
        .from('invitations')
        .insert({
            sender_id: currentUser.id,
            receiver_id: receiverId,
            status: 'pending',
            created_at: new Date().toISOString()
        });
    
    if (error) {
        showNotification('Erreur lors de l\'envoi', 'error');
        return false;
    }
    
    showNotification('Invitation envoyée', 'success');
    return true;
}

async function acceptInvitation(invitationId, senderId) {
    const { error } = await supabaseClient
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('id', invitationId);
    
    if (error) {
        showNotification('Erreur', 'error');
        return false;
    }
    
    showNotification('Contact ajouté', 'success');
    refreshCurrentTab();
    return true;
}

async function rejectInvitation(invitationId, senderId) {
    const { error } = await supabaseClient
        .from('invitations')
        .update({ 
            status: 'rejected',
            rejected_at: new Date().toISOString()
        })
        .eq('id', invitationId);
    
    if (error) {
        showNotification('Erreur', 'error');
        return false;
    }
    
    // Bloquer l'expéditeur pendant 3 minutes
    blockedUntil.set(senderId, Date.now() + 3 * 60 * 1000);
    showNotification('Invitation refusée', 'info');
    refreshCurrentTab();
    return true;
}

async function unblockUser(userId) {
    blockedUntil.delete(userId);
    
    // Supprimer l'ancienne invitation rejetée
    await supabaseClient
        .from('invitations')
        .delete()
        .eq('sender_id', userId)
        .eq('receiver_id', currentUser.id)
        .eq('status', 'rejected');
    
    showNotification('Utilisateur débloqué', 'success');
    refreshCurrentTab();
}

async function deleteContact(contactId) {
    // Supprimer toutes les invitations acceptées entre les deux
    await supabaseClient
        .from('invitations')
        .delete()
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${contactId},status.eq.accepted),and(sender_id.eq.${contactId},receiver_id.eq.${currentUser.id},status.eq.accepted)`);
    
    showNotification('Contact supprimé', 'success');
    refreshCurrentTab();
}

// ========== CHARGER LES CONTACTS ==========
async function loadContacts() {
    const { data, error } = await supabaseClient
        .from('invitations')
        .select(`
            id,
            sender_id,
            receiver_id,
            users_sender:users!invitations_sender_id_fkey(id, username, avatar_url),
            users_receiver:users!invitations_receiver_id_fkey(id, username, avatar_url)
        `)
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
    if (error) return [];
    
    const contacts = data.map(inv => {
        const isSender = inv.sender_id === currentUser.id;
        const contactData = isSender ? inv.users_receiver : inv.users_sender;
        return {
            id: contactData.id,
            username: contactData.username,
            avatar_url: contactData.avatar_url,
            invitation_id: inv.id
        };
    });
    
    return contacts;
}

async function loadReceivedInvitations() {
    const { data, error } = await supabaseClient
        .from('invitations')
        .select(`
            id,
            sender_id,
            users_sender:users!invitations_sender_id_fkey(id, username, avatar_url)
        `)
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');
    
    if (error) return [];
    
    return data.map(inv => ({
        id: inv.id,
        sender_id: inv.sender_id,
        username: inv.users_sender.username,
        avatar_url: inv.users_sender.avatar_url
    }));
}

async function loadSentInvitations() {
    const { data, error } = await supabaseClient
        .from('invitations')
        .select(`
            id,
            receiver_id,
            users_receiver:users!invitations_receiver_id_fkey(id, username, avatar_url)
        `)
        .eq('sender_id', currentUser.id)
        .eq('status', 'pending');
    
    if (error) return [];
    
    return data.map(inv => ({
        id: inv.id,
        receiver_id: inv.receiver_id,
        username: inv.users_receiver.username,
        avatar_url: inv.users_receiver.avatar_url
    }));
}

// ========== RENDU DES CARTES ==========
function renderUserCard(user, actionType, actionData = null) {
    const avatar = user.avatar_url 
        ? `<img src="${user.avatar_url}" class="user-avatar">`
        : `<div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>`;
    
    let actionButton = '';
    
    switch(actionType) {
        case 'invite':
            actionButton = `<button class="action-btn invite" data-action="invite" data-user-id="${user.id}">🙌</button>`;
            break;
        case 'pending':
            actionButton = `<button class="action-btn pending" disabled>⏳</button>`;
            break;
        case 'accept':
            actionButton = `
                <button class="action-btn accept" data-action="accept" data-inv-id="${actionData.id}" data-user-id="${user.id}">✅</button>
                <button class="action-btn reject" data-action="reject" data-inv-id="${actionData.id}" data-user-id="${user.id}">❌</button>
            `;
            break;
        case 'unblock':
            actionButton = `<button class="action-btn unblock" data-action="unblock" data-user-id="${user.id}">🔄</button>`;
            break;
        case 'contact':
            actionButton = `<button class="action-btn delete" data-action="delete" data-user-id="${user.id}">🗑️</button>`;
            break;
        default:
            actionButton = '';
    }
    
    const card = document.createElement('div');
    card.className = `user-card ${actionType === 'grayed' ? 'grayed' : ''}`;
    card.innerHTML = `
        <div class="user-avatar">${avatar}</div>
        <div class="user-info">
            <div class="user-name">${user.username}</div>
            <div class="user-status">${user.about || 'Disponible'}</div>
        </div>
        ${actionButton}
    `;
    
    if (actionType !== 'grayed' && actionType !== 'pending') {
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                window.location.href = `chat.html?user=${user.id}`;
            }
        });
    }
    
    return card;
}

// ========== AFFICHAGE DES LISTES ==========
async function renderContactsTab() {
    const contacts = await loadContacts();
    
    if (contacts.length === 0) {
        contentContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>Aucun contact</p>
                <p>Recherchez des utilisateurs pour commencer</p>
            </div>
        `;
        return;
    }
    
    contentContainer.innerHTML = '';
    contacts.forEach(contact => {
        const card = renderUserCard(contact, 'contact');
        contentContainer.appendChild(card);
        
        // Appui long pour supprimer
        let pressTimer;
        card.addEventListener('touchstart', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                pressTimer = setTimeout(() => {
                    if (confirm(`Supprimer ${contact.username} de vos contacts ?`)) {
                        deleteContact(contact.id);
                    }
                }, 500);
            }
        });
        card.addEventListener('touchend', () => clearTimeout(pressTimer));
        card.addEventListener('touchmove', () => clearTimeout(pressTimer));
        
        // Gestion bouton suppression
        const deleteBtn = card.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Supprimer ${contact.username} de vos contacts ?`)) {
                    deleteContact(contact.id);
                }
            });
        }
    });
}

async function renderReceivedTab() {
    const invitations = await loadReceivedInvitations();
    
    if (invitations.length === 0) {
        contentContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>Aucune invitation reçue</p>
            </div>
        `;
        return;
    }
    
    contentContainer.innerHTML = '';
    invitations.forEach(inv => {
        const user = { id: inv.sender_id, username: inv.username, avatar_url: inv.avatar_url };
        const card = renderUserCard(user, 'accept', { id: inv.id });
        contentContainer.appendChild(card);
        
        card.querySelector('[data-action="accept"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            acceptInvitation(inv.id, inv.sender_id);
        });
        card.querySelector('[data-action="reject"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            rejectInvitation(inv.id, inv.sender_id);
        });
    });
}

async function renderSentTab() {
    const invitations = await loadSentInvitations();
    
    if (invitations.length === 0) {
        contentContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-paper-plane"></i>
                <p>Aucune invitation envoyée</p>
            </div>
        `;
        return;
    }
    
    contentContainer.innerHTML = '';
    invitations.forEach(inv => {
        const user = { id: inv.receiver_id, username: inv.username, avatar_url: inv.avatar_url };
        const card = renderUserCard(user, 'pending');
        contentContainer.appendChild(card);
    });
}

async function renderSearchResults(query) {
    const users = await searchUsers(query);
    
    if (users.length === 0) {
        contentContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Aucun utilisateur trouvé</p>
            </div>
        `;
        return;
    }
    
    // Récupérer toutes les relations
    const { data: invitations } = await supabaseClient
        .from('invitations')
        .select('sender_id, receiver_id, status')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
    const relationMap = new Map();
    invitations?.forEach(inv => {
        const otherId = inv.sender_id === currentUser.id ? inv.receiver_id : inv.sender_id;
        relationMap.set(otherId, inv.status);
    });
    
    contentContainer.innerHTML = '';
    for (const user of users) {
        const status = relationMap.get(user.id);
        const isBlocked = blockedUntil.has(user.id);
        
        if (status === 'accepted') {
            const card = renderUserCard(user, 'contact');
            contentContainer.appendChild(card);
        } else if (status === 'pending') {
            const isSender = invitations?.some(inv => inv.sender_id === currentUser.id && inv.receiver_id === user.id);
            if (isSender) {
                const card = renderUserCard(user, 'pending');
                contentContainer.appendChild(card);
            } else {
                const card = renderUserCard(user, 'accept', { id: invitations?.find(inv => inv.sender_id === user.id)?.id });
                contentContainer.appendChild(card);
            }
        } else if (isBlocked) {
            const card = renderUserCard(user, 'unblock');
            contentContainer.appendChild(card);
            card.querySelector('[data-action="unblock"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                unblockUser(user.id);
            });
        } else {
            const card = renderUserCard(user, 'invite');
            contentContainer.appendChild(card);
            card.querySelector('[data-action="invite"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                sendInvitation(user.id);
            });
        }
    }
}

// ========== GESTION DES ONGLETS ET RECHERCHE ==========
async function refreshCurrentTab() {
    const query = searchInput.value.trim();
    
    if (query && query.length >= 2) {
        await renderSearchResults(query);
    } else {
        switch(currentTab) {
            case 'contacts':
                await renderContactsTab();
                break;
            case 'received':
                await renderReceivedTab();
                break;
            case 'sent':
                await renderSentTab();
                break;
        }
    }
}

function switchTab(tabId) {
    currentTab = tabId;
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    searchInput.value = '';
    refreshCurrentTab();
}

// ========== INITIALISATION ==========
async function init() {
    const user = await loadCurrentUser();
    if (!user) return;
    
    // Gestion onglets
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    // Gestion recherche
    searchInput.addEventListener('input', (e) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            refreshCurrentTab();
        }, 300);
    });
    
    // Chargement initial
    refreshCurrentTab();
}

init();