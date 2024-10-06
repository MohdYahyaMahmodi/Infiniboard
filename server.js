const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));

// Store drawn lines
let drawnLines = [];

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);

    // Send existing drawn lines to the new client
    socket.emit('init canvas', drawnLines);

    // Receive user info from the client
    socket.on('set user', (data) => {
        // Sanitize username to prevent XSS
        socket.username = data.username.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        socket.userId = data.userId;

        console.log('User set:', socket.username, socket.userId);
    });

    // Broadcast drawing data to other users and store it
    socket.on('drawing', (data) => {
        if (socket.username) {
            const lineData = {
                username: socket.username,
                userId: socket.userId,
                ...data
            };
            // Store the line only if the drawing is finished
            if (data.finished) {
                drawnLines.push(lineData);
            }
            // Broadcast to others
            socket.broadcast.emit('drawing', lineData);
        }
    });

    // Broadcast cursor position to other users
    socket.on('cursor move', (data) => {
        if (socket.username) {
            socket.broadcast.emit('cursor move', {
                username: socket.username,
                userId: socket.userId,
                x: data.x,
                y: data.y
            });
        }
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('A user disconnected: ' + socket.id);
        if (socket.username) {
            // Notify other users
            socket.broadcast.emit('user disconnected', {
                userId: socket.userId
            });
        }
    });
});

// Start the server
http.listen(3010, () => {
    console.log('Listening on *:3010');
});
