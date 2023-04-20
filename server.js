const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});

const port = process.env.PORT || 8080; // create port relative the host or just localhost:8080

// get user from any room by index
const getUserFromRoom = (room, index) => {
  return io.sockets.sockets.get([...io.sockets.adapter.rooms.get(room)][index]);
};

// get number of players inside of any room
const roomLength = (room) => {
  try {
    return Array.from(io.sockets.adapter.rooms.get(room)).length;
  } catch {
    return 0;
  }
};

// send player to menu
const setToMenuTimer = (room, timerDefault) => {
  let timerSeconds = timerDefault;
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

// set step timer for player
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
// when anyone has won the battle
const onWin = (winnerCells, whoWill, step, room, corner) => {
  io.to(room).emit("blocked"); // deny players to step
  io.to(room).emit("win", winnerCells, corner, step); // send who winner and what is corner (horizontal = 0deg and etc)
  clearInterval(stepIntervals.get(whoWill).func); // remove step timer
  setToMenuTimer(room, 12); // set the timer to send players to menu
};

// when player disconnected from room
const disconnected = (playerRoom, room, opponentRoom) => {
  if (toMenuIntervals?.get(room)?.func === undefined) {
    // checking is there already menu timer to avoid showing disconnect modal with another modal
    io.to(room).emit("disconnected"); // send to room that opponent left
    setToMenuTimer(room, 10); // set timer to send player to menu
    try {
      // does this player has timer in general?
      clearInterval(stepIntervals.get(playerRoom).func);
    } catch {
      // if not
      try {
        // does this player has timer in general too?
        clearInterval(stepIntervals.get(opponentRoom).func);
      } catch {}
    }
  }
};

let roomIndex = 0;
let cellsInLine = 3;
let stepIntervals = new Map();
let toMenuIntervals = new Map();
let cellsNumber = cellsInLine * cellsInLine;

// when player just connected
io.on("connection", (socket) => {
  socket.join("im online"); // this room is for number of online players
  io.to("in waiting").emit("send online", roomLength("im online")); // send number of players inside room "im online" to waiting players
  socket.on("im waiting", () => {
    // when player have rendered the component
    socket.join("in waiting"); // send player to waiting room
    if (roomLength("in waiting") > 1) {
      // when there are 2 players or more
      // generating an unique room
      roomIndex++;
      let currentRoom = `room ${roomIndex}`;
      let playerX = `playerX ${roomIndex}`;
      let playerO = `playerO ${roomIndex}`;
      // joining players to their rooms
      getUserFromRoom("in waiting", 0).join(currentRoom);
      getUserFromRoom("in waiting", 1).join(currentRoom);
      getUserFromRoom(currentRoom, 0).join(playerX);
      getUserFromRoom(currentRoom, 1).join(playerO);
      // when any player left the game
      getUserFromRoom("in waiting", 0).on("disconnecting", () => {
        disconnected(playerX, currentRoom, playerO);
      });
      getUserFromRoom("in waiting", 1).on("disconnecting", () => {
        disconnected(playerO, currentRoom, playerX);
      });
      // leaving players from the waiting room
      getUserFromRoom("in waiting", 1).leave("in waiting");
      getUserFromRoom("in waiting", 0).leave("in waiting");
      // sending emit that game was started to generate fields
      io.to(playerX).emit("game started", currentRoom, "x", playerX, playerO);
      io.to(playerO).emit("game started", currentRoom, "o", playerO, playerX);
      setStepTimer(playerX, currentRoom); // set timer to first player to make step
      io.to(playerX).emit("unblocked"); // let player to make step
    }
  });
  socket.on("disconnect", () => {
    // when any player disconnected
    io.to("in waiting").emit("send online", roomLength("im online")); //send number of online players to waiting room
  });
  socket.on("im leaving", (playerRoom, room, opponentRoom) => {
    // when player left the game
    socket.leave(room);
    socket.leave(playerRoom);
    socket.leave("in waiting");
    disconnected(playerRoom, room, opponentRoom);
  });
  socket.on("cellClick", (cells, id, room, step, whoClicked, whoWill) => {
    // when clicked any cell
    if (cells[id] === "") {
      // is the cell empty?
      let field = cells;
      let winnerCells = [];
      field[id] = step; // setting cell that clicked
      clearInterval(stepIntervals.get(whoClicked).func); // removing timer from player that has clicked
      setStepTimer(whoWill, room); // setting timer another player
      io.to(room).emit("fieldReload", field); // sending updated field to players
      io.to(whoClicked).emit("blocked"); // deny player that has clicked to step
      io.to(whoWill).emit("unblocked"); // let player that will click to step
      cellsCheck: for (let k = 0; k <= 4; k++) {
        // checking cells for a winner or when it's draw (using loop, to break it when winner found or it's draw)
        if (k === 0) {
          // horizontal checking
          let stepsInLine;
          for (let k = 0; k < cellsNumber; k += cellsInLine) {
            // checking every horizontal line
            stepsInLine = 0;
            winnerCells = [];
            for (j = k; j < k + cellsInLine; j++) {
              // checking every cell in the horizontal line
              if (cells[j] === step) {
                // if cell value = step
                stepsInLine++; // increment number of cells whit this value
                winnerCells.push(j); // push id to an array to make cross this cells
                if (stepsInLine === cellsInLine) {
                  // if each line's cell has step value
                  onWin(winnerCells, whoWill, step, room, "0deg"); // set winner
                  break cellsCheck; // break loop
                }
              }
            }
          }
        }
        if (k === 1) {
          // vertical checking
          let stepsInLine;
          for (let k = 0; k < cellsInLine; k++) {
            // checking every vertical line
            stepsInLine = 0;
            winnerCells = [];
            for (j = k; j <= cellsNumber; j += cellsInLine) {
              // checking every cell in the vertical line
              if (cells[j] === step) {
                // if cell value = step
                stepsInLine++; // increment number of cells whit this value
                winnerCells.push(j); // push id to an array to make cross this cells
                if (stepsInLine === cellsInLine) {
                  // if each line's cell has step value
                  onWin(winnerCells, whoWill, step, room, "90deg"); // set winner
                  break cellsCheck; // break loop
                }
              }
            }
          }
        }
        if (k === 2) {
          // diagonal checking from left top
          let stepsInLine = 0;
          winnerCells = [];
          for (let k = 0; k < cellsNumber; ) {
            // checking diagonal line from left top to right bottom (\)
            if (cells[k] === step) {
              // if cell value = step
              stepsInLine++; // increment number of cells whit this value
              winnerCells.push(k); // push id to an array to make cross this cells
              if (stepsInLine === cellsInLine) {
                // if each line's cell has step value
                onWin(winnerCells, whoWill, step, room, "45deg"); // set winner
                break cellsCheck; // break loop
              }
            }
            k = k + cellsInLine + 1;
          }
        }
        if (k === 3) {
          // diagonal checking from left bottom
          let stepsInLine = 0;
          winnerCells = [];
          for (let k = cellsInLine - 1; k <= cellsNumber - 2; ) {
            // checking diagonal line from left bottom to right top (/)
            if (cells[k] === step) {
              // if cell value = step
              stepsInLine++; // increment number of cells whit this value
              winnerCells.push(k); // push id to an array to make cross this cells
              if (stepsInLine === cellsInLine) {
                // if each line's cell has step value
                onWin(winnerCells, whoWill, step, room, "135deg"); // set winner
                break cellsCheck; // break loop
              }
            }
            k = k + cellsInLine - 1;
          }
        }
        if (k === 4) {
          // checking for a draw
          let busyCells = 0;
          for (j = 0; j <= cellsInLine * cellsInLine; j++) {
            // checking each cell of field
            if (cells[j] === "x" || cells[j] === "o") {
              // if cell has any value
              busyCells++; // increase the number of busy cells
            }
            if (busyCells === 9) {
              // if busy cells = 9
              winnerFound = true; // winner = draw
              io.to(room).emit("blocked"); // deny players to step
              io.to(room).emit("win", [], "", "draw"); // send to players that it's draw
              clearInterval(stepIntervals.get(whoWill).func); // remove step timer
              setToMenuTimer(room, 12); // set menu to send players to menu
              break cellsCheck; // break loop
            }
          }
        }
      }
    }
  });
  socket.on("play again", (room, againVotes, myRoom) => {
    // when anyone clicked to play again
    let againVotesIncremented = againVotes;
    if (againVotes < 2) {
      // if votes < 2
      againVotesIncremented++;
      io.to(myRoom).emit("vote btn blocked"); // player that voted can't step more
      io.to(room).emit("votes reload", againVotesIncremented); // sending updated votes to players
      io.to(myRoom).emit("blocked");
      if (againVotesIncremented === 2) {
        // when votes = 2
        clearInterval(toMenuIntervals.get(room).func); // timer to send players to menu stopped
        toMenuIntervals.get(room).func = undefined;
        io.to(room).emit("restart"); // restart the game
        setStepTimer(myRoom, room); // set timer for first player
      }
    }
  });
  socket.on("send name", (myName, opponentRoom) => {
    // when player sending his name
    io.to(opponentRoom).emit("get opponent name", myName); // send to opponent his name
  });
  socket.on("send message", (inputValue, myRoom, opponentRoom) => {
    // when player sending message
    const now = new Date(); // current date
    // current time
    const current =
      (now.getHours() < 10 ? "0" : "") +
      now.getHours() +
      ":" +
      (now.getMinutes() < 10 ? "0" : "") +
      now.getMinutes();
    io.to(myRoom).emit("get message", {
      // send to player that send message it as his
      text: inputValue,
      time: current,
      whose: "my",
    });
    io.to(opponentRoom).emit("get message", {
      // send to player that send message it as opponent's
      text: inputValue,
      time: current,
      whose: "opponent",
    });
  });
  socket.on("get online", () => {
    // when player requests number of players online
    io.to("in waiting").emit("send online", roomLength("im online")); // send number of players to player
  });
});

/* This part of the code is keeping the server running forever. 
The hosting is turning the server off when the script isn't used anywhere by its Express url for about 30 minutes. 
Forever node.js package isn't working on this hosting. 
The best option is to send request with GET method for this script from itself
*/
const https = require("https");

const options = {
  hostname: process.env.HOSTNAME,
  method: "GET",
};

setInterval(() => {
  const req = https.request(options);

  req.end();
}, 30000);

// Listening for incoming requests on the specified port
server.listen(port);
