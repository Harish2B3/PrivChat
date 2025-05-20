document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("create-room").addEventListener("click", createRoom);
    document.getElementById("join-room").addEventListener("click", joinRoom);
});

const ws = new WebSocket("ws://192.168.215.7:3000");
let peerConnection;
let dataChannel;
let pin;

ws.onmessage = (event) => {
    let data;
    try {
        data = JSON.parse(event.data);
    } catch (e) {
        console.error("Invalid JSON received:", event.data);
        return;
    }

    switch (data.type) {
        case 'status':
            handleStatus(data);
            break;
        case 'approval_request':
            handleApprovalRequest(data);
            break;
        case 'approval_result':
            handleApprovalResult(data);
            break;
        case 'peer-joined':
            handlePeerJoined(data);
            break;
        case 'peer-left':
            updateCount(data);
            break;
        case 'offer':
            if (peerConnection) handleOffer(data.offer);
            break;
        case 'answer':
            if (peerConnection) {
                peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
                    .catch(error => console.error("Error setting remote description:", error));
            }
            break;
        case 'ice-candidate':
            if (peerConnection && data.candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                    .catch(error => console.error("Error adding ICE candidate:", error));
            }
            break;
    }
};

function handleStatus(data) {
    alert(data.message);

    if (data.message === 'Room created' || data.message === 'Joined room') {
        renderChatUI();
        document.getElementById('pin').innerText = data.pin;
        document.getElementById('count').innerText = data.count;
    }

    if (data.message === 'Waiting for approval') {
        document.getElementById('pin').innerText = data.pin;
        document.getElementById('count').innerText = data.count;
    }
}

function handleApprovalRequest(data) {
    let un = data.un;
    const decision = confirm("Someone wants to join the room. Allow?") ? "Allow" : "Deny";
    ws.send(JSON.stringify({ type: "approval_response", un : un, pin: data.pin, decision }));
}

function handleApprovalResult(data) {
    alert(data.message);
    if (data.accepted) {
        renderChatUI();
        document.getElementById('pin').innerText = data.pin;
        document.getElementById('count').innerText = data.count;
        document.getElementById('user0').innerText = data.un0;
        document.getElementById('user1').innerText = data.un1;
        startWebRTC(true); // Initiator
    }
}

function handlePeerJoined(data) {
    document.getElementById('pin').innerText = data.pin;
    document.getElementById('count').innerText = data.count;
    document.getElementById('user0').innerText = data.un0;
    document.getElementById('user1').innerText = data.un1;
    startWebRTC(false);
}

function updateCount(data) {
    document.getElementById('pin').innerText = data.pin;
    document.getElementById('count').innerText = data.count;
    document.getElementById('user0').innerText = data.un0;
    document.getElementById('user1').innerText = data.un1;
}

function createRoom() {
    pin = document.getElementById('pin').value.trim();
    const un = document.getElementById('username').value;
    if (pin.length < 6 || pin.length > 8) return alert("Please enter a valid PIN.");
    ws.send(JSON.stringify({ type: "create", pin, un }));
}

function joinRoom() {
    pin = document.getElementById('pin').value.trim();
    let un = document.getElementById('username').value;
    if (pin.length < 6 || pin.length > 8) return alert("Please enter a valid PIN.");
    ws.send(JSON.stringify({ type: "join", pin, un }));
}

function renderChatUI() {
    document.head.innerHTML = `
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>PrivChat</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Rubik', sans-serif;
                background-color: #000;
                color: #fff;
                margin: 0;
                padding: 0;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }

            nav.navbar {
                background-color: #111 !important;
                border-bottom: 1px solid #333;
            }

            .online {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .peers-column {
                display: flex;
                gap: 30px;
            }

            .peer-block {
                display: flex;
                flex-direction: column;
                font-size: 0.95rem;
                gap: 4px;
            }

            .red-circle,
            .green-circle,
            .orange-circle,
            .blue-circle {
                display: inline-block;
                border-radius: 50%;
                width: 10px;
                height: 10px;
                margin-right: 5px;
            }

            .red-circle {
                background-color: red;
            }

            .green-circle {
                background-color: limegreen;
            }

            .orange-circle {
                background-color: #f7971e;
            }

            .blue-circle {
                background-color: #00c6ff;
            }



            .msg-container {
                flex: 1;
                padding: 15px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                scrollbar-width: thin;
                scrollbar-color: #333 #111;
                scroll-behavior: smooth;
            }

            .chat-container {
                position: sticky;
                bottom: 0;
                left: 0;
                width: 100%;
                padding: 10px 15px;
                background-color: #111;
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 999;
                box-sizing: border-box;
            }

            #msg {
                flex-grow: 1;
                min-width: 0;
                padding: 12px 15px;
                background-color: #1a1a1a;
                border: none;
                border-radius: 8px;
                color: #fff;
                font-size: 1rem;
                width: 100%;
            }

            #msg:focus {
                outline: 2px solid #444;
            }

            #msg::placeholder {
                color: #777;
            }

            .send-btn {
                background: none;
                border: none;
                padding: 5px;
                cursor: pointer;
            }

            .send-btn img {
                width: 28px;
                height: 28px;
                filter: invert(1);
            }

            .message {
                padding: 12px 16px;
                margin: 6px 0;
                max-width: 80%;
                font-size: 0.95rem;
                border-radius: 16px;
                line-height: 1.4;
                word-break: break-word;
            }

            .sent {
                align-self: flex-end;
                background: linear-gradient(135deg, #f7971e, #ffd200);
                color: #000;
            }

            .received {
                align-self: flex-start;
                background: linear-gradient(135deg, #00c6ff, #0072ff);
                color: #fff;
            }

            @media (max-width: 600px) {
                .chat-container {
                    padding: 8px 10px;
                }
                #msg {
                    font-size: 0.95rem;
                }
            }
        </style>
    `;

    document.body.innerHTML = `
        <nav class="navbar px-4 py-3">
            <div class="container-fluid justify-content-between">
                <h4 class="m-0">PrivChat</h4>
                <div class="online">
                   
                    <div class="peers-column">
                        <div class="peer-block">
                            <div>
                                <span class="orange-circle"></span>
                                <span id="user0">--</span>
                            </div>
                            <div>
                                <span class="red-circle"></span>
                                Room ID: 
                                <span id="pin">1234</span>
                            </div>
                        </div>
                        <div class="peer-block">
                            <div>
                                <span class="blue-circle"></span>
                                <span id="user1">--</span>
                            </div> 
                            <div><span class="green-circle"></span>Online: <span id="count">2</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </nav>


        <div class="msg-container" id="messages"></div>

        <div class="chat-container">
            <input type="text" id="msg" placeholder="Type a message..." onkeypress="handleKeyPress(event)">
            <button class="send-btn" onclick="sendMessage()">
                <img src="./images/paper-plane.png" alt="Send">
            </button>
        </div>
    `;

    const messageInput = document.getElementById("msg");
    const messagesContainer = document.getElementById("messages");

    messageInput.addEventListener('focus', () => {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 300);
    });

    window.addEventListener('resize', () => {
        if (document.activeElement === messageInput) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 300);
        }
    });
}


function updateUsernames(usernames) {
    document.getElementById("user0").innerText = usernames[0] || "Host";
    document.getElementById("user1").innerText = usernames[1] || "Peer";
}

function escapeHTML(str) { // Preventing XSS
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

function appendMessage(text, type) {
    const msgContainer = document.getElementById("messages");
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", type);
    msgDiv.innerHTML = escapeHTML(text); // Prevent XSS
    msgContainer.appendChild(msgDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById("msg");
    const message = input.value.trim();
    if (!message) return;

    appendMessage(message, "sent");

    if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(message);
    } else {
        console.warn("Data channel is not open.");
    }

    input.value = "";
    input.focus();
}

function handleKeyPress(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
    }
}

function setupDataChannelEvents(channel) {
    dataChannel = channel;

    dataChannel.onopen = () => {
        console.log("Data channel is open");
        const statusDot = document.querySelector(".green-circle");
        if (statusDot) statusDot.style.backgroundColor = "limegreen";
    };

    dataChannel.onclose = () => {
        console.warn("Data channel closed");
        const statusDot = document.querySelector(".green-circle");
        if (statusDot) statusDot.style.backgroundColor = "gray";
    };

    dataChannel.onmessage = (event) => {
        appendMessage(event.data, "received");
    };
}

function startWebRTC(isInitiator) {
    peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "ice-candidate", pin, candidate: event.candidate }));
        }
    };

    peerConnection.ondatachannel = (event) => {
        setupDataChannelEvents(event.channel);
    };

    if (isInitiator) {
        const channel = peerConnection.createDataChannel("chat");
        setupDataChannelEvents(channel);

        peerConnection.createOffer().then(offer => {
            return peerConnection.setLocalDescription(offer);
        }).then(() => {
            ws.send(JSON.stringify({ type: "offer", pin, offer: peerConnection.localDescription }));
        }).catch(console.error);
    }
}

function handleOffer(offer) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        return peerConnection.createAnswer();
    }).then(answer => {
        return peerConnection.setLocalDescription(answer);
    }).then(() => {
        ws.send(JSON.stringify({ type: "answer", pin, answer: peerConnection.localDescription }));
    }).catch(console.error);
}
