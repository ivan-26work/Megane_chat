// index.js
const supabaseUrl = 'https://mqfeisvvyrzeauayyilv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZmVpc3Z2eXJ6ZWF1YXl5aWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDE1NDcsImV4cCI6MjA4OTc3NzU0N30.7Tj1OUuEZmd5oqdVNACcG4eXQ13MBCgKmaJ43nJitdQ';

let supabaseClient;
let currentUserId = null;
let currentUser = null;
let selectedContactId = null;
let longPressTimer = null;
let isLongPress = false;

// Éléments DOM
const conversationsList = document.getElementById('conversations-list');
const searchInput = document.getElementById('search-input');
const contextMenu = document.getElementById('context-menu');
const viewProfileBtn = document.getElementById('view-profile');
const addFavoriteBtn = document.getElementById('add-favorite');
const pinChatBtn = document.getElementById('pin-chat');
const archiveChatBtn = document.getElementById('archive-chat');
const deleteChatBtn = document.getElementById('delete-chat');
const reportChatBtn = document.getElementById('report-chat');
const categoriesContainer = document.getElementById('categories-container');
const bottomNav = document.getElementById('bottom-nav');

// Initialisation
async function init() {
    await initSupabase();
    await checkAuth();
    if (currentUserId) {
        await loadConversations();
        setupEventListeners();
        setupNavigation();
    }
}

async function initSupabase() {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    } else {
        console.error('Supabase non chargé');
    }
}

async function checkAuth() {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = 'auth.html';
        return;
    }
    
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);
    if (error || !user) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('persist_session');
        window.location.href = 'auth.html';
        return;
    }
    
    currentUserId = user.id;
    const { data: userData } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', currentUserId)
        .single();
    
    currentUser = userData;
    
    // Appliquer mode nuit
    if (currentUser && currentUser.dark_mode) {
        document.body.classList.add('dark-mode');
    }
}

async function loadConversations() {
    // Récupérer les conversations
    const { data: conversations, error } = await supabaseClient
        .from('conversations')
        .select(`
            id,
            updated_at,
            participants:conversation_participants!inner(user_id),
            last_message:messages!conversation_last_message_fkey(message, created_at, sender_id)
        `)
        .eq('participants.user_id', currentUserId)
        .order('updated_at', { ascending: false });
    
    if (error) {
        console.error('Erreur chargement conversations:', error);
        return;
    }
    
    // Récupérer les infos des contacts
    const contactsData = [];
    for (const conv of conversations) {
        const otherParticipant = conv.participants.find(p => p.user_id !== currentUserId);
        if (otherParticipant) {
            const { data: userData } = await supabaseClient
                .from('users')
                .select('id, username, avatar_url, status, last_seen')
                .eq('id', otherParticipant.user_id)
                .single();
            
            if (userData) {
                // Compter messages non lus
                const { count: unreadCount } = await supabaseClient
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', conv.id)
                    .eq('sender_id', otherParticipant.user_id)
                    .eq('read', false);
                
                contactsData.push({
                    id: conv.id,
                    contactId: otherParticipant.user_id,
                    username: userData.username,
                    avatar_url: userData.avatar_url,
                    status: userData.status || 'offline',
                    last_seen: userData.last_seen,
                    last_message: conv.last_message ? {
                        text: conv.last_message.message,
                        time: conv.last_message.created_at,
                        sender_id: conv.last_message.sender_id
                    } : null,
                    updated_at: conv.updated_at,
                    unread_count: unreadCount || 0,
                    is_pinned: false,
                    is_favorite: false,
                    is_archived: false
                });
            }
        }
    }
    
    // Charger les préférences utilisateur (favoris, épinglés, archivés)
    const { data: preferences } = await supabaseClient
        .from('user_conversation_preferences')
        .select('conversation_id, is_favorite, is_pinned, is_archived')
        .eq('user_id', currentUserId);
    
    const prefMap = {};
    if (preferences) {
        preferences.forEach(pref => {
            prefMap[pref.conversation_id] = {
                is_favorite: pref.is_favorite,
                is_pinned: pref.is_pinned,
                is_archived: pref.is_archived
            };
        });
    }
    
    // Appliquer les préférences
    contactsData.forEach(contact => {
        const pref = prefMap[contact.id];
        if (pref) {
            contact.is_favorite = pref.is_favorite || false;
            contact.is_pinned = pref.is_pinned || false;
            contact.is_archived = pref.is_archived || false;
        }
    });
    
    renderConversations(contactsData);
}

function renderConversations(contacts) {
    // Séparer les contacts
    const pinned = contacts.filter(c => c.is_pinned);
    const favorites = contacts.filter(c => c.is_favorite && !c.is_pinned && !c.is_archived);
    const normal = contacts.filter(c => !c.is_pinned && !c.is_favorite && !c.is_archived);
    const archived = contacts.filter(c => c.is_archived);
    
    let categoriesHtml = '';
    let hasCategories = false;
    
    // Favoris
    if (favorites.length > 0) {
        hasCategories = true;
        categoriesHtml += `
            <div class="category-bar" data-category="favorites">
                <div class="category-header" data-toggle="favorites">
                    <span class="category-title"><i class="fas fa-star"></i> Favoris</span>
                    <span class="category-toggle"><i class="fas fa-chevron-down"></i></span>
                </div>
                <div class="category-content" id="favorites-content">
                    ${renderContactList(favorites)}
                </div>
            </div>
        `;
    }
    
    // Archivés
    if (archived.length > 0) {
        hasCategories = true;
        categoriesHtml += `
            <div class="category-bar" data-category="archived">
                <div class="category-header" data-toggle="archived">
                    <span class="category-title"><i class="fas fa-archive"></i> Archivés</span>
                    <span class="category-toggle"><i class="fas fa-chevron-down"></i></span>
                </div>
                <div class="category-content" id="archived-content">
                    ${renderContactList(archived)}
                </div>
            </div>
        `;
    }
    
    // Liste principale (épinglés + normaux)
    let mainListHtml = '';
    if (pinned.length > 0) {
        mainListHtml += `<div class="pinned-section">${renderContactList(pinned)}</div>`;
    }
    if (normal.length > 0) {
        mainListHtml += renderContactList(normal);
    }
    
    if (hasCategories) {
        document.body.classList.add('has-categories');
    } else {
        document.body.classList.remove('has-categories');
    }
    
    categoriesContainer.innerHTML = categoriesHtml;
    conversationsList.innerHTML = mainListHtml;
    
    // Attacher événements pour les catégories
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.parentElement.querySelector('.category-content');
            const icon = header.querySelector('.category-toggle i');
            content.classList.toggle('expanded');
            if (content.classList.contains('expanded')) {
                icon.className = 'fas fa-chevron-up';
            } else {
                icon.className = 'fas fa-chevron-down';
            }
        });
        
        // Ouvrir par défaut
        const content = header.parentElement.querySelector('.category-content');
        content.classList.add('expanded');
        const icon = header.querySelector('.category-toggle i');
        icon.className = 'fas fa-chevron-up';
    });
    
    // Attacher événements clic sur contacts
    document.querySelectorAll('.contact-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!isLongPress) {
                const contactId = item.dataset.contactId;
                const conversationId = item.dataset.conversationId;
                window.location.href = `chat.html?contact=${contactId}&conv=${conversationId}`;
            }
            isLongPress = false;
        });
        
        // Appui long
        let pressTimer;
        item.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
                isLongPress = true;
                const contactId = item.dataset.contactId;
                const username = item.dataset.username;
                showContextMenu(e, contactId, username);
            }, 500);
        });
        
        item.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
            setTimeout(() => { isLongPress = false; }, 100);
        });
        
        item.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });
        
        // Pour souris (développement)
        item.addEventListener('mousedown', (e) => {
            pressTimer = setTimeout(() => {
                isLongPress = true;
                const contactId = item.dataset.contactId;
                const username = item.dataset.username;
                showContextMenu(e, contactId, username);
            }, 500);
        });
        
        item.addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
            setTimeout(() => { isLongPress = false; }, 100);
        });
        
        item.addEventListener('mouseleave', () => {
            clearTimeout(pressTimer);
        });
    });
}

function renderContactList(contacts) {
    return contacts.map(contact => {
        const statusClass = contact.status === 'online' ? 'online' : (contact.status === 'away' ? 'away' : 'offline');
        const initial = contact.username.charAt(0).toUpperCase();
        const avatarHtml = contact.avatar_url 
            ? `<img src="${contact.avatar_url}" class="avatar ${statusClass}" alt="${contact.username}">`
            : `<div class="avatar ${statusClass}">${initial}</div>`;
        
        const lastMessage = contact.last_message 
            ? (contact.last_message.sender_id === currentUserId ? 'Vous: ' : '') + contact.last_message.text
            : 'Aucun message';
        
        const time = contact.last_message 
            ? formatTime(contact.last_message.time)
            : '';
        
        const unreadBadge = contact.unread_count > 0 
            ? `<span class="unread-badge">${contact.unread_count > 99 ? '99+' : contact.unread_count}</span>`
            : '';
        
        return `
            <div class="contact-item" 
                 data-contact-id="${contact.contactId}" 
                 data-conversation-id="${contact.id}"
                 data-username="${contact.username}">
                <div class="avatar-container">
                    ${avatarHtml}
                </div>
                <div class="contact-info">
                    <div class="contact-name-row">
                        <span class="contact-name">${escapeHtml(contact.username)}</span>
                        ${unreadBadge}
                    </div>
                    <div class="contact-message-row">
                        <span class="contact-last-message">${escapeHtml(lastMessage)}</span>
                        <span class="contact-time">${time}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'hier';
    } else if (days < 7) {
        return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    } else {
        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

let currentContextContactId = null;
let currentContextUsername = null;

function showContextMenu(event, contactId, username) {
    event.preventDefault();
    currentContextContactId = contactId;
    currentContextUsername = username;
    
    const x = event.clientX || event.touches?.[0]?.clientX;
    const y = event.clientY || event.touches?.[0]?.clientY;
    
    contextMenu.style.display = 'flex';
    contextMenu.style.position = 'fixed';
    contextMenu.style.top = `${y - 50}px`;
    contextMenu.style.right = '16px';
    
    setTimeout(() => {
        contextMenu.classList.add('show');
    }, 10);
}

function hideContextMenu() {
    contextMenu.classList.remove('show');
    setTimeout(() => {
        contextMenu.style.display = 'none';
    }, 200);
}

async function updateConversationPreference(conversationId, field, value) {
    const { data: existing } = await supabaseClient
        .from('user_conversation_preferences')
        .select('*')
        .eq('user_id', currentUserId)
        .eq('conversation_id', conversationId)
        .single();
    
    if (existing) {
        await supabaseClient
            .from('user_conversation_preferences')
            .update({ [field]: value, updated_at: new Date().toISOString() })
            .eq('user_id', currentUserId)
            .eq('conversation_id', conversationId);
    } else {
        await supabaseClient
            .from('user_conversation_preferences')
            .insert({
                user_id: currentUserId,
                conversation_id: conversationId,
                [field]: value,
                is_favorite: field === 'is_favorite' ? value : false,
                is_pinned: field === 'is_pinned' ? value : false,
                is_archived: field === 'is_archived' ? value : false
            });
    }
    
    await loadConversations();
}

// Événements menu contextuel
viewProfileBtn.addEventListener('click', async () => {
    hideContextMenu();
    if (currentContextContactId) {
        window.location.href = `profil.html?id=${currentContextContactId}`;
    }
});

addFavoriteBtn.addEventListener('click', async () => {
    hideContextMenu();
    if (currentContextContactId) {
        // Récupérer la conversation
        const { data: conv } = await supabaseClient
            .from('conversations')
            .select('id')
            .eq('participants.user_id', currentUserId)
            .eq('participants.user_id', currentContextContactId)
            .single();
        
        if (conv) {
            await updateConversationPreference(conv.id, 'is_favorite', true);
        }
    }
});

pinChatBtn.addEventListener('click', async () => {
    hideContextMenu();
    if (currentContextContactId) {
        const { data: conv } = await supabaseClient
            .from('conversations')
            .select('id')
            .eq('participants.user_id', currentUserId)
            .eq('participants.user_id', currentContextContactId)
            .single();
        
        if (conv) {
            await updateConversationPreference(conv.id, 'is_pinned', true);
        }
    }
});

archiveChatBtn.addEventListener('click', async () => {
    hideContextMenu();
    if (currentContextContactId) {
        const { data: conv } = await supabaseClient
            .from('conversations')
            .select('id')
            .eq('participants.user_id', currentUserId)
            .eq('participants.user_id', currentContextContactId)
            .single();
        
        if (conv) {
            await updateConversationPreference(conv.id, 'is_archived', true);
        }
    }
});

deleteChatBtn.addEventListener('click', async () => {
    hideContextMenu();
    if (currentContextContactId && confirm('Supprimer cette conversation ?')) {
        const { data: conv } = await supabaseClient
            .from('conversations')
            .select('id')
            .eq('participants.user_id', currentUserId)
            .eq('participants.user_id', currentContextContactId)
            .single();
        
        if (conv) {
            await supabaseClient
                .from('conversations')
                .delete()
                .eq('id', conv.id);
            
            await loadConversations();
        }
    }
});

reportChatBtn.addEventListener('click', () => {
    hideContextMenu();
    if (currentContextContactId) {
        window.location.href = `signal.html?user=${currentContextContactId}`;
    }
});

// Clic en dehors pour fermer le menu
document.addEventListener('click', (e) => {
    if (contextMenu.style.display === 'flex' && !contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// Recherche
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.contact-item').forEach(item => {
        const name = item.querySelector('.contact-name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
});

// Navigation
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page === 'chat') return;
            if (page === 'blog') window.location.href = 'blog.html';
            if (page === 'recherche') window.location.href = 'recherche.html';
            if (page === 'parametres') window.location.href = 'para.html';
        });
    });
}

function setupEventListeners() {
    // Scroll hide nav (identique à comple.html)
    const scrollContainer = document.querySelector('.conversations-list');
    let lastScrollTop = 0;
    
    scrollContainer.addEventListener('scroll', () => {
        const scrollTop = scrollContainer.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 50) {
            bottomNav.classList.add('hide');
        } else {
            bottomNav.classList.remove('hide');
        }
        lastScrollTop = scrollTop;
    });
}

// Démarrer
init();