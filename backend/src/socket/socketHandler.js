const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a room
    socket.on('join-room', ({ roomId, userName }) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userName = userName || 'Anonymous';
      console.log(`${socket.userName} (${socket.id}) joined room: ${roomId}`);

      // Broadcast updated user count
      const room = io.sockets.adapter.rooms.get(roomId);
      const count = room ? room.size : 1;
      io.to(roomId).emit('room-users', count);
    });

    // Broadcast a stroke to everyone else in the room
    socket.on('draw-stroke', ({ roomId, stroke }) => {
      socket.to(roomId).emit('receive-stroke', stroke);
    });

    // Broadcast undo event
    socket.on('undo-stroke', (roomId) => {
      socket.to(roomId).emit('stroke-undone');
    });

    // Broadcast clear board event
    socket.on('clear-board', (roomId) => {
      socket.to(roomId).emit('board-cleared');
    });

    // Broadcast cursor position
    socket.on('cursor-move', ({ roomId, x, y }) => {
      socket.to(roomId).emit('cursor-update', {
        id: socket.id,
        name: socket.userName,
        x,
        y,
      });
    });

    // Chat message
    socket.on('chat-message', ({ roomId, text }) => {
      io.to(roomId).emit('chat-receive', {
        id: socket.id,
        name: socket.userName,
        text,
        time: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      if (socket.roomId) {
        const room = io.sockets.adapter.rooms.get(socket.roomId);
        const count = room ? room.size : 0;
        io.to(socket.roomId).emit('room-users', count);
        // Tell others to remove this cursor
        socket.to(socket.roomId).emit('cursor-remove', socket.id);
      }
    });
  });
};

module.exports = socketHandler;