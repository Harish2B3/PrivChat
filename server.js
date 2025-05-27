const ws = require('ws');
const express = require('express');
const port = 3000;
const app = express();
const wss = new ws.Server({ port: 3000 });
const hbs = require('hbs');
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');

app.use(session({
    secret: '27ecc7c80aabea76559a0f2b3c8909b1dd904051bd6d8a2c9af934bf0b133d4f',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

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
        process.exit(1);
    } else {
        console.log("Connected to MySQL database.");
    }
});

app.set('view engine', 'hbs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('main');
});

app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error });
});

app.get('/register', (req, res) => {
    res.render('registration', { error: req.query.error });
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { username: req.session.user });
});

app.get('/chat', isAuthenticated, (req, res) => {
    res.render('chat', { username: req.session.user });
});

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login?error=Please log in to access this page.');
    }
}

app.post('/registerdata', async (req, res) => {
    const { fullname, email, username, password, mobileno } = req.body;

    db.query('SELECT username, email FROM users WHERE username = ? OR email = ?', [username, email], async (err, results) => {
        if (err) {
            console.error("Database error during registration check:", err);
            return res.redirect('/register?error=An unexpected error occurred.');
        }

        if (results.length > 0) {
            if (results.some(row => row.username === username)) {
                return res.redirect('/register?error=Username already exists.');
            }
            if (results.some(row => row.email === email)) {
                return res.redirect('/register?error=Email already registered.');
            }
        }

        try {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            db.query(
                'INSERT INTO users (fullname, email, username, password, mobile) VALUES (?, ?, ?, ?, ?)',
                [fullname, email, username, hashedPassword, mobileno],
                (insertErr) => {
                    if (insertErr) {
                        console.error("Database error during user insertion:", insertErr);
                        return res.redirect('/register?error=Failed to register user.');
                    } else {
                        res.redirect('/login?success=Registration successful! Please log in.');
                    }
                }
            );
        } catch (hashError) {
            console.error("Error hashing password:", hashError);
            res.redirect('/register?error=Failed to process password.');
        }
    });
});

app.post('/login', (req, res) => {
    const username = req.body.un;
    const password = req.body.pass;

    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, result) => {
        if (err) {
            console.error("Database error during login:", err);
            return res.redirect('/login?error=An unexpected error occurred.');
        }

        if (result.length > 0) {
            const user = result[0];
            try {
                const match = await bcrypt.compare(password, user.password);
                if (match) {
                    req.session.user = username;
                    res.redirect('/dashboard');
                } else {
                    res.redirect('/login?error=Invalid username or password.');
                }
            } catch (compareError) {
                console.error("Error comparing passwords:", compareError);
                res.redirect('/login?error=An authentication error occurred.');
            }
        } else {
            res.redirect('/login?error=Invalid username or password.');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error destroying session:", err);
        }
        res.redirect('/login?success=You have been logged out.');
    });
});

app.listen(81, () => {
    console.log('Server started on port 81');
});

const chatRooms = {};
const waitingRooms = {};

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data;
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
                const unApproved = data.un;

                const clientToApproveIndex = waitingRooms[pin].username.indexOf(unApproved);
                let clientToApprove = null;
                if (clientToApproveIndex !== -1) {
                    clientToApprove = waitingRooms[pin].clients[clientToApproveIndex];
                }

                if (clientToApprove) {
                    if (decision === "Allow") {
                        if (chatRooms[pin] && chatRooms[pin].clients.length < 2) {
                            chatRooms[pin].clients.push(clientToApprove);
                            chatRooms[pin].username.push(unApproved);

                            clientToApprove.send(JSON.stringify({
                                type: "approval_result",
                                accepted: true,
                                message: "You have been accepted into the room.",
                                pin,
                                un0: chatRooms[pin].username[0],
                                un1: unApproved,
                                count: chatRooms[pin].clients.length
                            }));

                            const host = chatRooms[pin].clients[0];
                            const hostun = chatRooms[pin].username[0];
                            if (host && host !== clientToApprove) {
                                host.send(JSON.stringify({
                                    type: "peer-joined",
                                    pin,
                                    un0: hostun,
                                    un1: unApproved,
                                    count: chatRooms[pin].clients.length
                                }));
                            }
                        } else {
                            clientToApprove.send(JSON.stringify({
                                type: "approval_result",
                                accepted: false,
                                message: "Room is now full. Try again later."
                            }));
                        }
                    } else {
                        clientToApprove.send(JSON.stringify({
                            type: "approval_result",
                            accepted: false,
                            message: "Your request was denied."
                        }));
                    }
                    waitingRooms[pin].clients.splice(clientToApproveIndex, 1);
                    waitingRooms[pin].username.splice(clientToApproveIndex, 1);
                }

                if (waitingRooms[pin] && waitingRooms[pin].clients.length === 0) {
                    delete waitingRooms[pin];
                }
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

            default:
                ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
        }
    });

    ws.on('close', () => {
        Object.keys(chatRooms).forEach(pin => {
            const room = chatRooms[pin];
            const index = room.clients.indexOf(ws);
        
            if (index !== -1) {
                const leavingUsername = room.username[index];
                room.clients.splice(index, 1);
                room.username.splice(index, 1);
        
                if (room.clients.length === 0) {
                    delete chatRooms[pin];
                    console.log("Room deleted:", pin);
                } else {
                    room.clients.forEach(client => {
                        client.send(JSON.stringify({
                            type: "peer-left",
                            pin: pin,
                            count: room.clients.length,
                            un0: room.username[0] || "--",
                            un1: room.username[1] || "--",
                            leavingUser: leavingUsername
                        }));
                    });
                }
            }
        });
        
        Object.keys(waitingRooms).forEach(pin => {
            const room = waitingRooms[pin];
            const index = room.clients.indexOf(ws);
            if (index !== -1) {
                room.clients.splice(index, 1);
                room.username.splice(index, 1);
            }
            if (room.clients.length === 0) {
                delete waitingRooms[pin];
            }
        });
    });
});