const io = require("socket.io")(8080, {
  cors: {
    origin: ["http://localhost:3000"],
  },
});

const getUserFromRoom = (room, index) => {
  return io.sockets.sockets.get([...io.sockets.adapter.rooms.get(room)][index]);
};

const roomLength = (room) => {
  try {
    return Array.from(io.sockets.adapter.rooms.get(room)).length;
  } catch {
    return 0;
  }
};

const setToMenuTimer = (room, timerDefault) => {
  timerSeconds = timerDefault;
  toMenuIntervals.set(room, {
    func: setInterval(() => {
      timerSeconds--;
      if (timerSeconds === 0) {
        clearInterval(toMenuIntervals.get(room).func);
        io.to(room).emit("to menu");
      }
      io.to(room).emit("to menu timer decrement", timerSeconds);
    }, 1000),
  });
};

const setStepTimer = (me, room) => {
  let timerSeconds = 35;
  io.to(room).emit("timer decrement", me, timerSeconds);
  stepIntervals.set(me, {
    func: setInterval(() => {
      timerSeconds--;
      if (timerSeconds === 0) {
        clearInterval(stepIntervals.get(me).func);
        io.to(room).emit("timeout", me);
        setToMenuTimer(room, 10);
      }
      io.to(room).emit("timer decrement", me, timerSeconds);
    }, 1000),
  });
};

const onWin = (winnerCells, whoWill, step, room, corner) => {
  winnerFound = true;
  io.to(room).emit("blocked");
  io.to(room).emit("win", winnerCells, corner, step);
  clearInterval(stepIntervals.get(whoWill).func);
  setToMenuTimer(room, 12);
};

let roomIndex = 0;
let cellsInLine = 3;
let stepIntervals = new Map();
let toMenuIntervals = new Map();
let cellsNumber = cellsInLine * cellsInLine;

io.on("connection", (socket) => {
  socket.join("im online");
  io.to("in waiting").emit("send online", roomLength("im online"));
  socket.on("im waiting", () => {
    socket.join("in waiting");
    if (roomLength("in waiting") > 1) {
      roomIndex++;
      let currentRoom = `room ${roomIndex}`;
      let playerX = `playerX ${roomIndex}`;
      let playerO = `playerO ${roomIndex}`;
      getUserFromRoom("in waiting", 0).join(currentRoom);
      getUserFromRoom("in waiting", 1).join(currentRoom);
      getUserFromRoom(currentRoom, 0).join(playerX);
      getUserFromRoom(currentRoom, 1).join(playerO);
      getUserFromRoom("in waiting", 1).leave("in waiting");
      getUserFromRoom("in waiting", 0).leave("in waiting");
      io.to(playerX).emit("game started", currentRoom, "x", playerX, playerO);
      io.to(playerO).emit("game started", currentRoom, "o", playerO, playerX);
      setStepTimer(playerX, currentRoom);
      io.to(playerX).emit("unblocked");
    }
  });
  socket.on("disconnect", () => {
    io.to("in waiting").emit("send online", roomLength("im online"));
  });
  socket.on("im leaving", (playerRoom, room) => {
    socket.leave(room);
    socket.leave(playerRoom);
    socket.leave("in waiting");
  });
  socket.on("cellClick", (cells, id, room, step, whoClicked, whoWill) => {
    if (cells[id] === "") {
      clearInterval(stepIntervals.get(whoClicked).func);
      io.to(whoWill).emit("unblocked");
      let field = cells;
      let winnerCells = [];
      let winnerFound = false;
      field[id] = step;
      io.to(room).emit("fieldReload", field);
      io.to(whoClicked).emit("blocked");
      io.to(whoWill).emit("unblocked");
      io.to(room).emit("timer reload", roomIndex);
      setStepTimer(whoWill, room);
      if (!winnerFound) {
        let stepsInLine;
        for (let k = 0; k < cellsNumber; k += cellsInLine) {
          stepsInLine = 0;
          winnerCells = [];
          for (j = k; j < k + cellsInLine; j++) {
            if (cells[j] === step) {
              stepsInLine++;
              winnerCells.push(j);
              if (stepsInLine === cellsInLine) {
                onWin(winnerCells, whoWill, step, room, "0deg");
              }
            }
          }
        }
      }
      if (!winnerFound) {
        let stepsInLine;
        for (let k = 0; k < cellsInLine; k++) {
          stepsInLine = 0;
          winnerCells = [];
          for (j = k; j <= cellsNumber; j += cellsInLine) {
            if (cells[j] === step) {
              stepsInLine++;
              winnerCells.push(j);
              if (stepsInLine === cellsInLine) {
                onWin(winnerCells, whoWill, step, room, "90deg");
              }
            }
          }
        }
      }
      if (!winnerFound) {
        let stepsInLine = 0;
        winnerCells = [];
        for (let k = 0; k < cellsNumber; ) {
          if (cells[k] === step) {
            stepsInLine++;
            winnerCells.push(k);
            if (stepsInLine === cellsInLine) {
              onWin(winnerCells, whoWill, step, room, "45deg");
            }
          }
          k = k + cellsInLine + 1;
        }
      }
      if (!winnerFound) {
        let stepsInLine = 0;
        winnerCells = [];
        for (k = cellsInLine - 1; k <= cellsNumber - 2; ) {
          if (cells[k] === step) {
            stepsInLine++;
            winnerCells.push(k);
            if (stepsInLine === cellsInLine) {
              onWin(winnerCells, whoWill, step, room, "135deg");
            }
          }
          k = k + cellsInLine - 1;
        }
      }
      let busyCells = 0;
      for (j = 0; j <= cellsInLine * cellsInLine; j++) {
        if (cells[j] === "x" || cells[j] === "o") {
          busyCells++;
        }
        if (busyCells === cellsInLine * cellsInLine) {
          io.to(room).emit("blocked");
          io.to(room).emit("win", [], null, "draw");
          clearInterval(stepIntervals.get(whoWill).func);
          setToMenuTimer(room, 12);
        }
      }
    }
  });
  socket.on("play again", (room, againVotes, myRoom) => {
    let againVotesIncremented = againVotes;
    if (againVotes < 2) {
      againVotesIncremented++;
      io.to(myRoom).emit("vote btn blocked");
      io.to(room).emit("votes reload", againVotesIncremented);
      io.to(myRoom).emit("blocked");
      if (againVotesIncremented === 2) {
        clearInterval(toMenuIntervals.get(room).func);
        setStepTimer(myRoom, room);
        io.to(room).emit("restart");
      }
    }
  });
  socket.on("send name", (myName, enemyRoom) => {
    io.to(enemyRoom).emit("get enemy name", myName);
  });
  socket.on("send message", (inputValue, myRoom, enemysRoom) => {
    const now = new Date();
    const current =
      (now.getHours() < 10 ? "0" : "") +
      now.getHours() +
      ":" +
      (now.getMinutes() < 10 ? "0" : "") +
      now.getMinutes();
    io.to(myRoom).emit("get message", {
      text: inputValue,
      time: current,
      whose: "my",
    });
    io.to(enemysRoom).emit("get message", {
      text: inputValue,
      time: current,
      whose: "enemys",
    });
  });
  socket.on("get online", () => {
    io.to("in waiting").emit("send online", roomLength("im online"));
  });
});