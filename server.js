const ws = require('ws');
const express = require('express');
const port = 3000;
const app = express();
const wss = new ws.Server({ port });
const hbs = require('hbs');
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');


// Session config
app.use(session({
    secret: '27ecc7c80aabea76559a0f2b3c8909b1dd904051bd6d8a2c9af934bf0b133d4f',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// MySQL DB connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'privchat',
    port: 3306
});

db.connect((err) => {
    if (err) {
        console.error("MySQL connection error:", err);
    } else {
        console.log("Connected to MySQL database.");
    }
});

// Express config
app.set('view engine', 'hbs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.render('main');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('registration');
});

// Dashboard (protected)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { username: req.session.user });
});

// Chat (protected)
app.get('/chat', isAuthenticated, (req, res) => {
    res.render('chat');
});

// Middleware to protect routes
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.post('/registerdata', (req, res) => {
    const { fullname, email, username, password, mobileno } = req.body;

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            res.render('registration', { message: 'An error occurred' });
        } else {
            db.query(
                'INSERT INTO users (fullname, email, username, password, mobile) VALUES (?, ?, ?, ?, ?)',
                [fullname, email, username, hashedPassword, mobileno],
                (err) => {
                    if (err) {
                        res.render('registration', { message: 'An error occurred' });
                    } else {
                        res.redirect('/login');
                    }
                }
            );
        }
    });
});

function filterMessage(message) {
    const regex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const sym = /<>!/g;
    msg = message.replace(sym, '');
    return msg.replace(regex, '');
}


// Login handler
app.post('/login', (req, res) => {
    const username = req.body.un;
    const password = req.body.pass;

    db.query('SELECT * FROM users WHERE username = ?', [username], (err, result) => {
        if (err) {
            res.render('login', { message: 'An error occurred' });
        } else if (result.length === 0) {
            res.render('login', { message: 'Incorrect username or password' });
        } else {
            bcrypt.compare(password, result[0].password, (err, match) => {
                if (err) {
                    res.render('login', { message: 'An error occurred' });
                } else if (match) {
                    req.session.user = username;
                    res.redirect('/dashboard');
                } else {
                    res.render('login', { message: 'Incorrect username or password' });
                }
            });
        }
    });
});


// Logout handler
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.log(err);
        }
        res.redirect('/login');
    });
});


// Start Express server
app.listen(81, () => {
    console.log('Server started on port 81');
});


const chatRooms = {};
const waitingRooms = {};
const groupchatRooms = {};
const groupwaitingRooms = {};

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            data = JSON.parse(message);
        } catch (error) {
            console.error("Invalid JSON received:", message);
            return ws.send(JSON.stringify({ type: "error", message: "Invalid JSON format" }));
        }

        const pin = data.pin;
        const un = data.un;
      
        switch (data.type) {
            case 'create': {
                if (chatRooms[pin]) {
                    if (chatRooms[pin].clients.includes(ws)) {
                        return ws.send(JSON.stringify({ type: "status", message: 'You are already in the room' }));
                    }
                    if (chatRooms[pin].clients.length >= 2) {
                        return ws.send(JSON.stringify({ type: "status", message: 'Room is full' }));
                    }
                    return ws.send(JSON.stringify({ type: "status", message: 'Room already exists' }));
                }

                chatRooms[pin] = { username: [un], clients: [ws] };

                ws.send(JSON.stringify({
                    type: "status",
                    pin,
                    un,
                    count: chatRooms[pin].clients.length,
                    message: 'Room created'
                }));
                break;
            }

            case 'join': {
                if (!chatRooms[pin]) {
                    return ws.send(JSON.stringify({ type: "status", message: 'Room not found' }));
                }

                const host = chatRooms[pin].clients?.[0];
                if (host) {
                    host.send(JSON.stringify({ type: "approval_request", pin, un }));
                }

                if (!waitingRooms[pin]) {
                    waitingRooms[pin] = { username: [], clients: [] };
                }

                waitingRooms[pin].clients.push(ws);
                waitingRooms[pin].username.push(un);

                ws.send(JSON.stringify({
                    type: "status",
                    pin,
                    un,
                    count: waitingRooms[pin].clients.length,
                    message: "Waiting for approval"
                }));
                break;
            }

            case 'approval_response': {
                const decision = data.decision;
                const waitingClients = waitingRooms[pin]?.clients || [];
                const un = data.un;
                waitingClients.forEach(client => {
                    if (decision === "Allow") {
                        if (chatRooms[pin] && chatRooms[pin].clients.length < 2) {
                            chatRooms[pin].clients.push(client);
                            chatRooms[pin].username.push(un);

                            // Notify client
                            client.send(JSON.stringify({
                                type: "approval_result",
                                accepted: true,
                                message: "You have been accepted into the room.",
                                pin,
                                un0: chatRooms[pin].username[0],
                                un1: un,
                                count: chatRooms[pin].clients.length

                            }));

                            // Notify host
                            const host = chatRooms[pin].clients[0];
                            const hostun = chatRooms[pin].username[0];
                            if (host && host !== client) {
                                host.send(JSON.stringify({
                                    type: "peer-joined",
                                    pin,
                                    un0: hostun,
                                    un1: un,
                                    count: chatRooms[pin].clients.length
                                }));
                            }
                        } else {
                            client.send(JSON.stringify({
                                type: "approval_result",
                                accepted: false,
                                message: "Room is now full. Try again later."
                            }));
                        }
                    } else {
                        client.send(JSON.stringify({
                            type: "approval_result",
                            accepted: false,
                            message: "Your request was denied."
                        }));
                    }
                });

                delete waitingRooms[pin];
                break;
            }

            case 'offer':
            case 'answer':
            case 'ice-candidate': {
                if (chatRooms[pin]) {
                    chatRooms[pin].clients.forEach(client => {
                        if (client !== ws) {
                            client.send(JSON.stringify(data));
                        }
                    });
                }
                break;
            }

            case 'group-create': {
                if (groupchatRooms[pin]) {
                    if (groupchatRooms[pin].clients.includes(ws)) {
                        return ws.send(JSON.stringify({ type: "status", message: 'You are already in the room' }));
                    }
                    if (groupchatRooms[pin].clients.length >= 2) {
                        return ws.send(JSON.stringify({ type: "status", message: 'Room is full' }));
                    }
                    return ws.send(JSON.stringify({ type: "status", message: 'Room already exists' }));
                }

                groupchatRooms[pin] = { username: [un], clients: [ws] };

                ws.send(JSON.stringify({
                    type: "status",
                    pin,
                    un,
                    count: groupchatRooms[pin].clients.length,
                    message: 'Group created'
                }));
                break;
            }

            case 'group-join': {
                if (!groupchatRooms[pin]) {
                    return ws.send(JSON.stringify({ type: "status", message: 'Room not found' }));
                }

                const host = groupchatRooms[pin].clients?.[0];
                if (host) {
                    host.send(JSON.stringify({ type: "approval_request", pin, un }));
                }

                if (!groupwaitingRooms[pin]) {
                    groupwaitingRooms[pin] = { username: [], clients: [] };
                }

                groupwaitingRooms[pin].clients.push(ws);
                groupwaitingRooms[pin].username.push(un);

                ws.send(JSON.stringify({
                    type: "status",
                    pin,
                    un,
                    count: groupwaitingRooms[pin].clients.length,
                    message: "Waiting for approval"
                }));
                break;
            }



            default:
                ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
        }


    });

    ws.on('close', () => {
        Object.keys(chatRooms).forEach(pin => {
            const room = chatRooms[pin];
            const index = room.clients.indexOf(ws);
    
            if (index !== -1) {
                room.clients.splice(index, 1);
                room.username.splice(index, 1); // remove corresponding username
    
                if (room.clients.length === 0) {
                    delete chatRooms[pin];
                    console.log("Room deleted:", pin);
                } else {
                    // Notify remaining peer
                    room.clients.forEach(client => {
                        client.send(JSON.stringify({
                            type: "peer-left",
                            pin: pin,
                            count: room.clients.length,
                            un0: room.username[0] || "--",
                            un1: room.username[1] || "--"
                        }));
                    });
                }
            }
        });
    
        Object.keys(waitingRooms).forEach(pin => {
            const room = waitingRooms[pin];
            room.clients = room.clients.filter(client => client !== ws);
            if (room.clients.length === 0) {
                delete waitingRooms[pin];
            }
        });
    });
    
});