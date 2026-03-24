// index.js - Page des discussions récentes
const SUPABASE_URL = 'https://mqfeisvvyrzeauayyilv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZmVpc3Z2eXJ6ZWF1YXl5aWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDE1NDcsImV4cCI6MjA4OTc3NzU0N30.7Tj1OUuEZmd5oqdVNACcG4eXQ13MBCgKmaJ43nJitdQ';

if (!window._supabaseClient) {
    window._supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const supabaseClient = window._supabaseClient;

// État global
let currentUser = null;
let conversations = [];
let favoriteConversations = [];
let archivedConversations = [];
let pinnedConversations = [];
let currentSelectedContact = null;
let longPressTimer = null;
let contextMenu = document.getElementById('context-menu');

// DOM Elements
const searchInput = document.getElementById('search-input');
const conversationsList = document.getElementById('conversations-list');
const categoriesContainer = document.getElementById('categories-container');

// ========== UTILISATEUR ==========
async function getCurrentUser() {
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

// ========== CHARGER LES CONVERSATIONS ==========
async function loadConversations() {
    // Récupérer tous les contacts acceptés
    const { data: contacts, error: contactsError } = await supabaseClient
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
    
    if (contactsError) {
        console.error('Erreur chargement contacts:', contactsError);
        return [];
    }
    
    const contactList = contacts.map(inv => {
        const isSender = inv.sender_id === currentUser.id;
        const contactData = isSender ? inv.users_receiver : inv.users_sender;
        return {
            id: contactData.id,
            username: contactData.username,
            avatar_url: contactData.avatar_url,
            invitation_id: inv.id
        };
    });
    
    // Récupérer les messages récents pour chaque contact
    const conversationsWithLastMsg = [];
    
    for (const contact of contactList) {
        // Récupérer ou créer une conversation
        let convId = null;
        const { data: existingConv } = await supabaseClient
            .from('conversations')
            .select('id')
            .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${contact.id}),and(user1_id.eq.${contact.id},user2_id.eq.${currentUser.id})`)
            .single();
        
        if (existingConv) {
            convId = existingConv.id;
        } else {
            const { data: newConv } = await supabaseClient
                .from('conversations')
                .insert({
                    user1_id: currentUser.id,
                    user2_id: contact.id,
                    last_message: '',
                    last_timestamp: new Date().toISOString()
                })
                .select()
                .single();
            convId = newConv?.id;
        }
        
        // Récupérer le dernier message
        let lastMessage = null;
        let unreadCount = 0;
        
        if (convId) {
            const { data: messages } = await supabaseClient
                .from('messages')
                .select('content, timestamp, status, sender_id')
                .eq('conversation_id', convId)
                .order('timestamp', { ascending: false })
                .limit(1);
            
            if (messages && messages.length > 0) {
                lastMessage = messages[0];
            }
            
            // Compter les messages non lus
            const { count } = await supabaseClient
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', convId)
                .eq('receiver_id', currentUser.id)
                .eq('status', 'sent');
            
            unreadCount = count || 0;
        }
        
        // Récupérer les préférences utilisateur (épinglé, favori, archivé)
        const { data: pref } = await supabaseClient
            .from('user_conversation_prefs')
            .select('is_pinned, is_favorite, is_archived')
            .eq('user_id', currentUser.id)
            .eq('contact_id', contact.id)
            .single();
        
        conversationsWithLastMsg.push({
            ...contact,
            conversation_id: convId,
            last_message: lastMessage?.content || '',
            last_timestamp: lastMessage?.timestamp || null,
            unread_count: unreadCount,
            is_pinned: pref?.is_pinned || false,
            is_favorite: pref?.is_favorite || false,
            is_archived: pref?.is_archived || false
        });
    }
    
    // Trier par date (plus récent en premier)
    conversationsWithLastMsg.sort((a, b) => {
        if (!a.last_timestamp) return 1;
        if (!b.last_timestamp) return -1;
        return new Date(b.last_timestamp) - new Date(a.last_timestamp);
    });
    
    return conversationsWithLastMsg;
}

// ========== AFFICHAGE DES CONVERSATIONS ==========
function formatLastMessage(content) {
    if (!content) return 'Aucun message';
    if (content.startsWith('🖼️')) return '📷 Photo';
    if (content.startsWith('🎬')) return '🎥 Vidéo';
    if (content.startsWith('🎵')) return '🎵 Audio';
    if (content.startsWith('📄')) return '📄 Document';
    if (content.startsWith('🎤')) return '🎤 Message vocal';
    if (content.length > 50) return content.substring(0, 50) + '...';
    return content;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'hier';
    } else if (days < 7) {
        return ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][date.getDay()];
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }
}

function renderConversations(convs) {
    if (!convs || convs.length === 0) {
        conversationsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <p>Aucune discussion</p>
                <p>Recherchez des utilisateurs pour commencer</p>
            </div>
        `;
        return;
    }
    
    conversationsList.innerHTML = '';
    
    convs.forEach(conv => {
        const initial = conv.username.charAt(0).toUpperCase();
        const avatarHtml = conv.avatar_url 
            ? `<img src="${conv.avatar_url}" class="avatar" alt="${conv.username}">`
            : `<div class="avatar">${initial}</div>`;
        
        const lastMessage = formatLastMessage(conv.last_message);
        const timeStr = formatTime(conv.last_timestamp);
        const unreadBadge = conv.unread_count > 0 
            ? `<span class="unread-badge">${conv.unread_count}</span>` 
            : '';
        
        const pinnedIcon = conv.is_pinned 
            ? '<i class="fas fa-thumbtack pinned-icon"></i>' 
            : '';
        
        const item = document.createElement('div');
        item.className = `contact-item ${conv.is_pinned ? 'pinned' : ''}`;
        item.setAttribute('data-contact-id', conv.id);
        item.setAttribute('data-conversation-id', conv.conversation_id || '');
        item.innerHTML = `
            <div class="avatar-container">
                ${avatarHtml}
            </div>
            <div class="contact-info">
                <div class="contact-name-row">
                    <div class="contact-name">${escapeHtml(conv.username)} ${pinnedIcon}</div>
                    ${unreadBadge}
                </div>
                <div class="contact-message-row">
                    <div class="contact-last-message">${escapeHtml(lastMessage)}</div>
                    <div class="contact-time">${timeStr}</div>
                </div>
            </div>
        `;
        
        // Clic simple → ouvrir chat
        item.addEventListener('click', () => {
            window.location.href = `chat.html?contact=${conv.id}`;
        });
        
        // Appui long → menu contextuel
        item.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                currentSelectedContact = conv;
                showContextMenu(e, conv);
            }, 500);
        });
        
        item.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });
        
        item.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });
        
        // Pour souris (test)
        item.addEventListener('mousedown', (e) => {
            longPressTimer = setTimeout(() => {
                currentSelectedContact = conv;
                showContextMenu(e, conv);
            }, 500);
        });
        
        item.addEventListener('mouseup', () => {
            clearTimeout(longPressTimer);
        });
        
        conversationsList.appendChild(item);
    });
}

// ========== MENU CONTEXTUEL ==========
function showContextMenu(event, contact) {
    contextMenu.style.display = 'flex';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    
    // Configurer les actions
    document.getElementById('view-profile').onclick = () => {
        window.location.href = `profil.html?user=${contact.id}`;
        hideContextMenu();
    };
    
    document.getElementById('add-favorite').onclick = () => {
        toggleFavorite(contact);
        hideContextMenu();
    };
    
    document.getElementById('pin-chat').onclick = () => {
        togglePin(contact);
        hideContextMenu();
    };
    
    document.getElementById('archive-chat').onclick = () => {
        toggleArchive(contact);
        hideContextMenu();
    };
    
    document.getElementById('delete-chat').onclick = () => {
        deleteConversation(contact);
        hideContextMenu();
    };
    
    document.getElementById('report-chat').onclick = () => {
        window.location.href = `signal.html?user=${contact.id}`;
        hideContextMenu();
    };
    
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 100);
}

function hideContextMenu() {
    contextMenu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
}

// ========== ACTIONS SUR CONVERSATIONS ==========
async function toggleFavorite(contact) {
    const newValue = !contact.is_favorite;
    await supabaseClient
        .from('user_conversation_prefs')
        .upsert({
            user_id: currentUser.id,
            contact_id: contact.id,
            is_favorite: newValue,
            updated_at: new Date().toISOString()
        });
    
    contact.is_favorite = newValue;
    refreshDisplay();
}

async function togglePin(contact) {
    const newValue = !contact.is_pinned;
    await supabaseClient
        .from('user_conversation_prefs')
        .upsert({
            user_id: currentUser.id,
            contact_id: contact.id,
            is_pinned: newValue,
            updated_at: new Date().toISOString()
        });
    
    contact.is_pinned = newValue;
    refreshDisplay();
}

async function toggleArchive(contact) {
    const newValue = !contact.is_archived;
    await supabaseClient
        .from('user_conversation_prefs')
        .upsert({
            user_id: currentUser.id,
            contact_id: contact.id,
            is_archived: newValue,
            updated_at: new Date().toISOString()
        });
    
    contact.is_archived = newValue;
    refreshDisplay();
}

async function deleteConversation(contact) {
    if (confirm(`Supprimer la conversation avec ${contact.username} ?`)) {
        // Supprimer tous les messages
        if (contact.conversation_id) {
            await supabaseClient
                .from('messages')
                .delete()
                .eq('conversation_id', contact.conversation_id);
        }
        
        // Supprimer la conversation
        if (contact.conversation_id) {
            await supabaseClient
                .from('conversations')
                .delete()
                .eq('id', contact.conversation_id);
        }
        
        refreshDisplay();
    }
}

// ========== RECHERCHE ==========
function filterConversations(query) {
    if (!query) {
        renderConversations(conversations);
        return;
    }
    
    const filtered = conversations.filter(conv =>
        conv.username.toLowerCase().includes(query.toLowerCase())
    );
    renderConversations(filtered);
}

// ========== AFFICHAGE AVEC CATÉGORIES ==========
async function refreshDisplay() {
    conversations = await loadConversations();
    
    // Séparer par catégories
    const pinned = conversations.filter(c => c.is_pinned);
    const favorites = conversations.filter(c => c.is_favorite && !c.is_pinned);
    const archived = conversations.filter(c => c.is_archived);
    const normal = conversations.filter(c => !c.is_pinned && !c.is_favorite && !c.is_archived);
    
    // Afficher les catégories
    let categoriesHtml = '';
    
    if (pinned.length > 0) {
        categoriesHtml += `
            <div class="category-bar" data-category="pinned">
                <div class="category-header">
                    <span class="category-title">📌 Épinglés</span>
                    <i class="fas fa-chevron-down category-toggle"></i>
                </div>
                <div class="category-content expanded">
                    ${renderCategoryItems(pinned)}
                </div>
            </div>
        `;
    }
    
    if (favorites.length > 0) {
        categoriesHtml += `
            <div class="category-bar" data-category="favorites">
                <div class="category-header">
                    <span class="category-title">⭐ Favoris</span>
                    <i class="fas fa-chevron-down category-toggle"></i>
                </div>
                <div class="category-content expanded">
                    ${renderCategoryItems(favorites)}
                </div>
            </div>
        `;
    }
    
    if (archived.length > 0) {
        categoriesHtml += `
            <div class="category-bar" data-category="archived">
                <div class="category-header">
                    <span class="category-title">📦 Archivés</span>
                    <i class="fas fa-chevron-down category-toggle"></i>
                </div>
                <div class="category-content expanded">
                    ${renderCategoryItems(archived)}
                </div>
            </div>
        `;
    }
    
    categoriesContainer.innerHTML = categoriesHtml;
    
    // Afficher les conversations normales
    renderConversations(normal);
    
    // Ajouter les événements toggle
    document.querySelectorAll('.category-bar').forEach(bar => {
        const header = bar.querySelector('.category-header');
        const content = bar.querySelector('.category-content');
        const toggle = bar.querySelector('.category-toggle');
        
        header.addEventListener('click', () => {
            content.classList.toggle('expanded');
            toggle.classList.toggle('fa-chevron-down');
            toggle.classList.toggle('fa-chevron-up');
        });
    });
}

function renderCategoryItems(convs) {
    return convs.map(conv => {
        const initial = conv.username.charAt(0).toUpperCase();
        const avatarHtml = conv.avatar_url 
            ? `<img src="${conv.avatar_url}" class="avatar" alt="${conv.username}">`
            : `<div class="avatar">${initial}</div>`;
        
        return `
            <div class="contact-item category-item" data-contact-id="${conv.id}" data-conversation-id="${conv.conversation_id || ''}">
                <div class="avatar-container">
                    ${avatarHtml}
                </div>
                <div class="contact-info">
                    <div class="contact-name">${escapeHtml(conv.username)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Attacher événements aux items des catégories
function attachCategoryEvents() {
    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            const contactId = item.dataset.contactId;
            window.location.href = `chat.html?contact=${contactId}`;
        });
    });
}

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

// ========== ESCAPE HTML ==========
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ========== INITIALISATION ==========
async function init() {
    const user = await getCurrentUser();
    if (!user) return;
    
    await refreshDisplay();
    attachCategoryEvents();
    
    // Recherche
    searchInput.addEventListener('input', (e) => {
        filterConversations(e.target.value);
    });
    
    // Abonnement temps réel pour nouveaux messages
    supabaseClient
        .channel('messages-updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, (payload) => {
            const newMsg = payload.new;
            // Vérifier si le message concerne l'utilisateur courant
            if (newMsg.receiver_id === currentUser.id || newMsg.sender_id === currentUser.id) {
                refreshDisplay();
                attachCategoryEvents();
            }
        })
        .subscribe();
}

init();
