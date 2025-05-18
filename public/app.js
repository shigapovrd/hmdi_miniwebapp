function debugLog(message, data = null) {
    // Временно отключаем логирование
    return;

    const logElement = document.getElementById('debugLogs');
    const timestamp = new Date().toLocaleTimeString();
    let logText = `[${timestamp}] ${message}\n`;

    if (data !== null) {
        logText += typeof data === 'object' ?
            JSON.stringify(data, null, 2) :
            String(data);
    }

    console.log(logText);

    logElement.style.display = 'block';
    logElement.innerHTML += logText + '\n-------------------\n';

    logElement.scrollTop = logElement.scrollHeight;
}

const tg = window.Telegram.WebApp;
tg.expand();

// Функция для хеширования строки
async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

// Генерация user_id на основе хеша от Telegram ID
async function generateUserId() {
    const telegramUser = tg.initDataUnsafe?.user;
    if (!telegramUser?.id) {
        return 'user_' + Math.random().toString(36).substr(2, 8);
    }

    const salt = Math.random().toString(36).substr(2, 8);
    const hash = await hashString(`${telegramUser.id}_${salt}`);
    return `user_${hash}`;
}

async function initUserId() {
    if (!window.Telegram?.WebApp) {
        return generateUserId();
    }

    const telegramUser = tg.initDataUnsafe?.user;
    if (!telegramUser || !telegramUser.id) {
        return generateUserId();
    }

    const storageKeyHash = await hashString(telegramUser.id.toString());
    const storageKey = `hmdi_${storageKeyHash}`;

    try {
        const userData = await tg.CloudStorage.getItem(storageKey);
        const isValidUserId = userData && typeof userData === 'string' && userData !== '[object Object]';

        if (!isValidUserId) {
            const newUserId = await generateUserId();
            await tg.CloudStorage.setItem(storageKey, newUserId);
            localStorage.setItem(storageKey, newUserId);
            return newUserId;
        }

        localStorage.setItem(storageKey, userData);
        return userData;
    } catch (error) {
        let userId = localStorage.getItem(storageKey);
        const isValidUserId = userId && typeof userId === 'string' && userId !== '[object Object]';

        if (!isValidUserId) {
            userId = await generateUserId();
            localStorage.setItem(storageKey, userId);
        }
        return userId;
    }
}

function isValidUserId(userId) {
    return userId &&
        typeof userId === 'string' &&
        userId !== '[object Object]' &&
        userId.startsWith('user_');
}

async function getCurrentUserId() {
    const telegramUser = tg.initDataUnsafe?.user;
    if (!telegramUser?.id) {
        const localId = localStorage.getItem('hmdi_user_id');
        return isValidUserId(localId) ? localId : await generateUserId();
    }
    const storageKeyHash = await hashString(telegramUser.id.toString());
    const localId = localStorage.getItem(`hmdi_${storageKeyHash}`);
    return isValidUserId(localId) ? localId : await generateUserId();
}

let isLoading = false;

// Загрузка заявок
async function loadHelpRequests() {
    if (isLoading) return;

    isLoading = true;
    const requestsContainer = document.getElementById('helpRequests');
    requestsContainer.innerHTML = '<div class="text-center"><div class="spinner-border text-info" role="status"></div><div>Загрузка заявок...</div></div>';

    try {
        const response = await fetch('https://hmdi-api.onrender.com/get-help-requests');
        const data = await response.json();
        console.log('Получены заявки:', data);

        const currentUserId = await getCurrentUserId();
        console.log('Текущий userId:', currentUserId);

        requestsContainer.innerHTML = '';

        if (data.requests && data.requests.length > 0) {
            const validRequests = data.requests.filter(request =>
                isValidUserId(request.user_id)
            );

            console.log('Отфильтрованные заявки:', validRequests);

            if (validRequests.length === 0) {
                requestsContainer.innerHTML = '<p class="text-center text-muted">Нет активных заявок</p>';
                isLoading = false;
                return;
            }

            validRequests.forEach(request => {
                if (request.user_id === currentUserId) {
                    return;
                }

                const timeString = new Date(request.created_at).toLocaleString();
                const requestElement = document.createElement('div');
                requestElement.className = 'request-card';
                requestElement.onclick = () => showRequestCard(request);

                requestElement.innerHTML = `
                            <div class="request-description">${request.description}</div>
                            <div class="request-time">${timeString}</div>
                        `;

                requestsContainer.appendChild(requestElement);
            });

            // Проверяем, есть ли заявки после фильтрации
            if (requestsContainer.children.length === 0) {
                requestsContainer.innerHTML = '<p class="text-center text-muted">Нет активных заявок</p>';
            }
        } else {
            requestsContainer.innerHTML = '<p class="text-center text-muted">Нет активных заявок</p>';
        }
    } catch (error) {
        console.error('Ошибка при загрузке заявок:', error);
        requestsContainer.innerHTML = '<p class="text-center text-danger">Ошибка при загрузке заявок</p>';
    } finally {
        isLoading = false;
    }
}

// Инициализация приложения
async function initializeApp() {
    console.log('Начало инициализации приложения');
    try {
        await initUserId();
        console.log('UserId инициализирован');
        await loadHelpRequests();
        console.log('Первичная загрузка заявок завершена');
    } catch (error) {
        console.error('Ошибка при инициализации:', error);
    }
}

// Запускаем инициализацию при загрузке страницы
initializeApp();

// Периодическое обновление заявок
setInterval(loadHelpRequests, 30000);

function showHelp() {
    document.getElementById('helpContainer').style.display = 'block';
    document.getElementById('offerContainer').style.display = 'none';
    document.getElementById('selectedRequest').style.display = 'none';
    selectedRequestData = null;
}

function showHelpOffer() {
    document.getElementById('helpContainer').style.display = 'none';
    document.getElementById('offerContainer').style.display = 'block';
    if (!isLoading) {
        loadHelpRequests();
    }
}

let selectedRequestData = null;

function showRequestCard(request) {
    selectedRequestData = request;
    const cardElement = document.getElementById('selectedRequest');
    const descElement = document.getElementById('selectedRequestDesc');

    descElement.innerText = request.description;
    cardElement.style.display = 'block';

    // Плавно прокручиваем к карточке
    cardElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeRequestCard() {
    document.getElementById('selectedRequest').style.display = 'none';
    selectedRequestData = null;
}

function respondWithTelegram() {
    if (!selectedRequestData) return;
    tg.showAlert('Открываем Telegram чат...');
    // Здесь будет логика для открытия Telegram чата
}

function respondWithChat() {
    if (!selectedRequestData) return;
    tg.showAlert('Открываем чат...');
    // Здесь будет логика для открытия чата
}

let jitsiApi = null;

function respondWithVideoCall() {
    if (!selectedRequestData) return;

    const container = document.getElementById('jitsiContainer');
    const userId = localStorage.getItem('hmdi_user_id');

    // Проверяем, не пытается ли пользователь помочь сам себе
    if (selectedRequestData.user_id === userId) {
        tg.showAlert('Вы не можете помогать с собственной заявкой');
        return;
    }

    // Создаем видео-комнату
    fetch("https://hmdi-api.onrender.com/create-video-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ticket_id: selectedRequestData.ticket_id,
            helper_id: userId
        })
    })
        .then(res => {
            if (!res.ok) {
                throw new Error('Ошибка создания видеозвонка');
            }
            return res.json();
        })
        .then(data => {
            if (data.error) {
                if (data.status === 'self_help_forbidden') {
                    tg.showAlert('Вы не можете помогать с собственной заявкой');
                } else {
                    tg.showAlert(data.error);
                }
                return;
            }

            container.style.display = 'block';

            const options = {
                roomName: data.room_id,
                width: '100%',
                height: '100%',
                parentNode: container,
                lang: 'ru',
                configOverwrite: {
                    prejoinPageEnabled: false,
                    startWithAudioMuted: true,
                    startWithVideoMuted: true
                },
                interfaceConfigOverwrite: {
                    TOOLBAR_BUTTONS: [
                        'microphone', 'camera', 'closedcaptions', 'desktop',
                        'fullscreen', 'fodeviceselection', 'hangup', 'chat',
                        'settings', 'raisehand', 'videoquality', 'filmstrip',
                        'shortcuts', 'tileview'
                    ],
                    SHOW_JITSI_WATERMARK: false,
                    SHOW_WATERMARK_FOR_GUESTS: false,
                    SHOW_BRAND_WATERMARK: false
                }
            };

            jitsiApi = new JitsiMeetExternalAPI(data.domain, options);

            // Обработчики событий
            jitsiApi.addEventListeners({
                readyToClose: () => {
                    closeVideoCall(data.room_id, userId);
                },
                videoConferenceLeft: () => {
                    closeVideoCall(data.room_id, userId);
                }
            });

            // Периодически проверяем статус комнаты
            const roomCheckInterval = setInterval(async () => {
                try {
                    const response = await fetch(
                        `https://hmdi-api.onrender.com/check-video-room/${data.room_id}?user_id=${userId}`
                    );
                    const roomStatus = await response.json();

                    if (roomStatus.status !== 'active') {
                        clearInterval(roomCheckInterval);
                        closeVideoCall(data.room_id, userId);
                    }
                } catch (error) {
                    console.error('Ошибка проверки статуса комнаты:', error);
                }
            }, 5000); // Проверяем каждые 5 секунд
        })
        .catch(error => {
            console.error('Ошибка:', error);
            tg.showAlert('Не удалось создать видеозвонок. Попробуйте позже.');
        });
}

function closeVideoCall(roomId, userId) {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }
    document.getElementById('jitsiContainer').style.display = 'none';

    // Уведомляем сервер о закрытии комнаты
    if (roomId && userId) {
        fetch("https://hmdi-api.onrender.com/end-video-room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                room_id: roomId,
                user_id: userId
            })
        }).catch(console.error);
    }
}

// Добавляем функцию обновления времени
let startTime = Date.now();

function updateActiveTime() {
    const minutes = Math.floor((Date.now() - startTime) / 60000);
    document.getElementById('activeTime').textContent = `${minutes} мин`;
}

// Обновляем время каждую минуту
setInterval(updateActiveTime, 60000);

// Функция для обновления количества активных пользователей
async function updateActiveUsers() {
    try {
        const response = await fetch('https://hmdi-api.onrender.com/active-users');
        const data = await response.json();
        document.getElementById('activeUsers').textContent = `${data.count} онлайн`;
    } catch (error) {
        console.error('Error fetching active users:', error);
    }
}

// Обновляем количество пользователей каждые 30 секунд
setInterval(updateActiveUsers, 30000);
updateActiveUsers(); // Первоначальное обновление