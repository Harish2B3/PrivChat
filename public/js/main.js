document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("create-room").addEventListener("click", createRoom);
    document.getElementById("join-room").addEventListener("click", joinRoom);
});

const ws = new WebSocket("ws://192.168.1.8:3000");
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
            overflow: hidden; /* Prevent body scroll */
        }

        nav.navbar {
            background-color: #111 !important;
            border-bottom: 1px solid #333;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3); /* Subtle shadow for depth */
            padding: 1rem 1.5rem; /* Adjusted padding */
        }

        .online {
            display: flex;
            align-items: center;
            gap: 20px; /* Increased gap */
        }

        .peers-column {
            display: flex;
            gap: 40px; /* Increased gap between peer blocks */
        }

        .peer-block {
            display: flex;
            flex-direction: column;
            font-size: 0.9rem; /* Slightly smaller font for info */
            gap: 6px; /* Adjusted gap */
        }

        .peer-block div {
            display: flex;
            align-items: center;
        }

        .red-circle,
        .green-circle,
        .orange-circle,
        .blue-circle {
            display: inline-block;
            border-radius: 50%;
            width: 9px; /* Slightly smaller circle */
            height: 9px; /* Slightly smaller circle */
            margin-right: 8px; /* Adjusted margin */
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
            padding: 20px; /* Increased padding for message area */
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px; /* Gap between messages */
            scrollbar-width: thin;
            scrollbar-color: #444 #1a1a1a; /* Darker scrollbar */
            scroll-behavior: smooth;
        }

        /* Custom scrollbar for WebKit browsers */
        .msg-container::-webkit-scrollbar {
            width: 8px;
        }

        .msg-container::-webkit-scrollbar-track {
            background: #1a1a1a;
        }

        .msg-container::-webkit-scrollbar-thumb {
            background-color: #444;
            border-radius: 10px;
            border: 2px solid #1a1a1a;
        }

        .chat-container {
            padding: 15px 20px; /* Adjusted padding */
            background-color: #111;
            border-top: 1px solid #333;
            display: flex;
            align-items: center;
            gap: 12px; /* Adjusted gap */
            box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3); /* Subtle shadow for depth */
        }

        #msg {
            flex-grow: 1;
            padding: 14px 18px; /* Larger padding for input */
            background-color: #1a1a1a;
            border: 1px solid #333; /* Slight border */
            border-radius: 25px; /* More rounded corners */
            color: #fff;
            font-size: 1rem;
            outline: none; /* Remove default outline */
            transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }

        #msg:focus {
            border-color: #f7971e; /* Highlight on focus */
            box-shadow: 0 0 0 3px rgba(247, 151, 30, 0.3); /* Soft glow */
        }

        #msg::placeholder {
            color: #777;
        }

        .send-btn {
            background: none;
            border: none;
            padding: 8px; /* Larger hit area */
            cursor: pointer;
            transition: transform 0.2s ease-in-out;
            display: flex; /* To center the image */
            align-items: center;
            justify-content: center;
        }

        .send-btn:hover {
            transform: scale(1.1); /* Slight scale on hover */
        }

        .send-btn img {
            width: 26px; /* Slightly smaller icon */
            height: 26px; /* Slightly smaller icon */
            filter: invert(1);
        }

        .message {
            padding: 14px 18px; /* Adjusted padding */
            max-width: 75%; /* Slightly reduced max-width */
            font-size: 0.98rem; /* Slightly larger font */
            border-radius: 20px; /* More rounded message bubbles */
            line-height: 1.5; /* Improved line spacing */
            word-break: break-word;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2); /* Subtle shadow for message bubbles */
            transition: transform 0.2s ease-in-out;
            display: flex; /* Flexbox for message content and sender name */
            flex-direction: column;
            gap: 4px; /* Space between message content and sender name */
        }

        .message:hover {
            transform: translateY(-2px); /* Lift effect on hover */
        }

        .message-content {
            flex-grow: 1; /* Allow content to take available space */
        }

        .sender-name {
            font-size: 0.75rem; /* Smaller font for sender name */
            opacity: 0.8; /* Slightly transparent */
            margin-top: 2px; /* Small space after message content */
            align-self: flex-end; /* Align name to the end of the bubble for sent messages */
        }
        
        .sent .sender-name {
            color: rgba(0, 0, 0, 0.6); /* Darker for sent messages */
            align-self: flex-end; /* Align name to the end of the bubble */
        }

        .received .sender-name {
            color: rgba(255, 255, 255, 0.7); /* Lighter for received messages */
            align-self: flex-start; /* Align name to the start of the bubble */
        }

        .sent {
            align-self: flex-end;
            background: linear-gradient(135deg, #f7971e, #ffd200);
            color: #000;
            border-bottom-right-radius: 5px; /* Pointy corner for sent messages */
        }

        .received {
            align-self: flex-start;
            background: linear-gradient(135deg, #00c6ff, #0072ff);
            color: #fff;
            border-bottom-left-radius: 5px; /* Pointy corner for received messages */
        }

        @media (max-width: 768px) {
            .peers-column {
                flex-direction: column;
                gap: 15px;
            }

            .navbar .container-fluid {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
        }

        @media (max-width: 600px) {
            .chat-container {
                padding: 10px 15px;
            }
            #msg {
                font-size: 0.9rem;
                padding: 12px 15px;
            }
            .send-btn img {
                width: 24px;
                height: 24px;
            }
            .message {
                padding: 10px 14px;
                font-size: 0.9rem;
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
