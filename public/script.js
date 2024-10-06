// script.js

document.addEventListener('DOMContentLoaded', () => {
  // Function to set a cookie
  function setCookie(name, value, days) {
      var expires = "";
      if (days) {
          var date = new Date();
          date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
          expires = "; expires=" + date.toUTCString();
      }
      document.cookie = name + "=" + (value || "") + expires + "; path=/";
  }

  // Function to get a cookie
  function getCookie(name) {
      var nameEQ = name + "=";
      var ca = document.cookie.split(';');
      for (var i = 0; i < ca.length; i++) {
          var c = ca[i];
          while (c.charAt(0) == ' ') c = c.substring(1, c.length);
          if (c.indexOf(nameEQ) == 0)
              return c.substring(nameEQ.length, c.length);
      }
      return null;
  }

  // Generate unique userId and store in cookie
  let userId = getCookie('userId');
  if (!userId) {
      userId = generateUUID();
      setCookie('userId', userId, 365);
  }

  let username = getCookie('username');
  if (!username) {
      // Show the modal
      const modal = document.getElementById('usernameModal');
      modal.style.display = 'block';

      const usernameInput = document.getElementById('usernameInput');
      const usernameSubmit = document.getElementById('usernameSubmit');

      usernameSubmit.addEventListener('click', () => {
          const tempElement = document.createElement('div');
          tempElement.textContent = usernameInput.value.trim();
          username = tempElement.textContent;
          if (username) {
              setCookie('username', username, 365);
              modal.style.display = 'none';
              initializeApp(username, userId);
          } else {
              alert('Please enter a valid username.');
          }
      });
  } else {
      initializeApp(username, userId);
  }

  // Function to generate UUID
  function generateUUID() {
      var d = new Date().getTime();
      var d2 =
          (performance && performance.now && performance.now() * 1000) || 0;
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
          /[xy]/g,
          function (c) {
              var r = Math.random() * 16;
              if (d > 0) {
                  r = ((d + r) % 16) | 0;
                  d = Math.floor(d / 16);
              } else {
                  r = ((d2 + r) % 16) | 0;
                  d2 = Math.floor(d2 / 16);
              }
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          }
      );
  }

  // Main application initialization
  function initializeApp(username, userId) {
      const socket = io();

      // Send sanitized username and userId to the server
      socket.emit('set user', { username: username, userId: userId });

      // Set up canvases and contexts
      const canvas = document.getElementById('whiteboard');
      const context = canvas.getContext('2d');

      const cursorCanvas = document.getElementById('cursorCanvas');
      const cursorContext = cursorCanvas.getContext('2d');

      const canvasContainer = document.getElementById('canvas-container');

      // Set initial canvas size
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - document.getElementById('toolbar').offsetHeight; // Adjust for toolbar height
      cursorCanvas.width = canvas.width;
      cursorCanvas.height = canvas.height;

      // Infinite canvas variables
      let canvasWidth = canvas.width;
      let canvasHeight = canvas.height;

      // Panning variables
      let isPanning = false;
      let startX = 0;
      let startY = 0;
      let offsetX = 0;
      let offsetY = 0;

      // Update coordinates display
      const coordinatesDisplay = document.getElementById('coordinates');

      function updateCoordinatesDisplay(x, y) {
          coordinatesDisplay.textContent = `X: ${Math.round(x + offsetX)}, Y: ${Math.round(y + offsetY)}`;
      }

      // Adjust canvas size on window resize
      window.addEventListener('resize', () => {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight - document.getElementById('toolbar').offsetHeight;
          cursorCanvas.width = canvas.width;
          cursorCanvas.height = canvas.height;
          redrawCanvas();
      });

      // Drawing state and current settings
      let drawing = false;
      let current = {
          color: document.getElementById('colorPicker').value,
          size: document.getElementById('brushSize').value,
          brushType: 'round',
          gradient: false,
          gradientStartColor: '#000000',
          gradientEndColor: '#FFFFFF',
          gradientSmoothness: 0.5,
          x: 0,
          y: 0,
          tool: 'pen' // 'pen' or 'eraser'
      };

      // Event listeners for drawing
      canvas.addEventListener('mousedown', onMouseDown, false);
      canvas.addEventListener('mouseup', onMouseUp, false);
      canvas.addEventListener('mousemove', throttle(onMouseMove, 10), false);

      // Touch support
      canvas.addEventListener('touchstart', onMouseDown, false);
      canvas.addEventListener('touchend', onMouseUp, false);
      canvas.addEventListener('touchmove', throttle(onMouseMove, 10), false);

      // Panning events
      canvasContainer.addEventListener('contextmenu', (e) => e.preventDefault()); // Disable context menu
      canvasContainer.addEventListener('mousedown', onPanStart, false);
      canvasContainer.addEventListener('mouseup', onPanEnd, false);
      canvasContainer.addEventListener('mousemove', onPanMove, false);

      // Toolbar input listeners
      document
          .getElementById('colorPicker')
          .addEventListener('change', onColorUpdate, false);
      document
          .getElementById('brushSize')
          .addEventListener('change', onBrushSizeUpdate, false);
      document
          .getElementById('brushType')
          .addEventListener('change', onBrushTypeUpdate, false);
      document
          .getElementById('gradientBtn')
          .addEventListener('click', onGradientToggle, false);

      // Gradient editor inputs
      document
          .getElementById('gradientStartColor')
          .addEventListener('change', onGradientStartColorUpdate, false);
      document
          .getElementById('gradientEndColor')
          .addEventListener('change', onGradientEndColorUpdate, false);
      document
          .getElementById('gradientSmoothness')
          .addEventListener('change', onGradientSmoothnessUpdate, false);

      // Pen and Eraser tool buttons
      document.getElementById('penBtn').addEventListener('click', () => {
          current.tool = 'pen';
          updateActiveTool();
      });
      document.getElementById('eraserBtn').addEventListener('click', () => {
          current.tool = 'eraser';
          updateActiveTool();
      });

      // Update active tool button styling
      function updateActiveTool() {
          document.getElementById('penBtn').classList.toggle('active', current.tool === 'pen');
          document.getElementById('eraserBtn').classList.toggle('active', current.tool === 'eraser');
      }

      // Color presets
      const colorSwatches = document.querySelectorAll('.color-swatch');
      colorSwatches.forEach(swatch => {
          swatch.addEventListener('click', () => {
              const color = swatch.getAttribute('data-color');
              current.color = color;
              document.getElementById('colorPicker').value = color;
              updateSelectedSwatch(swatch);
          });
      });

      function updateSelectedSwatch(selectedSwatch) {
          colorSwatches.forEach(swatch => {
              swatch.classList.toggle('selected', swatch === selectedSwatch);
          });
      }

      // Socket events
      socket.on('drawing', onDrawingEvent);
      socket.on('cursor move', onCursorMove);

      // Store other users' cursors
      let otherCursors = {};

      // Draw other users' cursors
      function drawCursors() {
          // Clear the cursor canvas
          cursorContext.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

          Object.keys(otherCursors).forEach(function (userId) {
              const cursor = otherCursors[userId];
              if (cursor) {
                  // Adjust for panning
                  const x = cursor.x - offsetX;
                  const y = cursor.y - offsetY;

                  if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
                      // Draw cursor
                      cursorContext.beginPath();
                      cursorContext.arc(
                          x,
                          y,
                          5,
                          0,
                          2 * Math.PI,
                          false
                      );
                      cursorContext.fillStyle = 'rgba(0,0,0,0.5)';
                      cursorContext.fill();

                      // Draw username
                      cursorContext.font = '12px Arial';
                      cursorContext.fillStyle = '#000';
                      cursorContext.fillText(
                          cursor.username,
                          x + 8,
                          y - 8
                      );
                  }
              }
          });

          // Request the next frame
          requestAnimationFrame(drawCursors);
      }

      drawCursors();

      // Draw a line on the canvas
      function drawLine(x0, y0, x1, y1, color, size, brushType, gradient, gradientColors, gradientSmoothness, tool, emit) {
          context.beginPath();
          context.moveTo(x0 - offsetX, y0 - offsetY);
          context.lineTo(x1 - offsetX, y1 - offsetY);

          // Set line properties
          context.lineWidth = size;
          context.lineCap = brushType;
          context.lineJoin = brushType;

          // Handle gradient
          if (gradient) {
              const grad = context.createLinearGradient(x0 - offsetX, y0 - offsetY, x1 - offsetX, y1 - offsetY);
              grad.addColorStop(0, gradientColors.start);
              grad.addColorStop(gradientSmoothness, gradientColors.end);
              context.strokeStyle = grad;
          } else {
              context.strokeStyle = color;
          }

          if (tool === 'eraser') {
              context.globalCompositeOperation = 'destination-out';
              context.strokeStyle = 'rgba(0,0,0,1)';
          } else {
              context.globalCompositeOperation = 'source-over';
          }

          context.stroke();
          context.closePath();

          if (!emit) {
              return;
          }

          socket.emit('drawing', {
              x0: x0,
              y0: y0,
              x1: x1,
              y1: y1,
              color: color,
              size: size,
              brushType: brushType,
              gradient: gradient,
              gradientColors: gradientColors,
              gradientSmoothness: gradientSmoothness,
              tool: tool,
          });
      }

      // Store drawn lines for redrawing during panning
      let drawnLines = [];

      // Mouse and touch event handlers
      function onMouseDown(e) {
          if (e.button !== 0 && e.type !== 'touchstart') return; // Left click or touch
          drawing = true;
          const coords = getCanvasCoordinates(e);
          current.x = coords.x;
          current.y = coords.y;
      }

      function onMouseUp(e) {
          if (!drawing) {
              return;
          }
          drawing = false;
      }

      function onMouseMove(e) {
          const coords = getCanvasCoordinates(e);
          updateCoordinatesDisplay(coords.x, coords.y);

          if (drawing) {
              drawLine(
                  current.x + offsetX,
                  current.y + offsetY,
                  coords.x + offsetX,
                  coords.y + offsetY,
                  current.color,
                  current.size,
                  current.brushType,
                  current.gradient,
                  {
                      start: current.gradientStartColor,
                      end: current.gradientEndColor
                  },
                  current.gradientSmoothness,
                  current.tool,
                  true
              );
              // Store the line
              drawnLines.push({
                  x0: current.x + offsetX,
                  y0: current.y + offsetY,
                  x1: coords.x + offsetX,
                  y1: coords.y + offsetY,
                  color: current.color,
                  size: current.size,
                  brushType: current.brushType,
                  gradient: current.gradient,
                  gradientColors: {
                      start: current.gradientStartColor,
                      end: current.gradientEndColor
                  },
                  gradientSmoothness: current.gradientSmoothness,
                  tool: current.tool,
              });
              current.x = coords.x;
              current.y = coords.y;
          }

          // Emit cursor position
          socket.emit('cursor move', {
              x: coords.x + offsetX,
              y: coords.y + offsetY,
          });
      }

      // Panning functions
      function onPanStart(e) {
          if (e.button !== 2 && e.type !== 'touchstart') return; // Right click or touch
          isPanning = true;
          startX = e.clientX - offsetX;
          startY = e.clientY - offsetY;
          canvasContainer.style.cursor = 'grabbing';
      }

      function onPanEnd(e) {
          isPanning = false;
          canvasContainer.style.cursor = 'grab';
      }

      function onPanMove(e) {
          if (!isPanning) return;
          offsetX = e.clientX - startX;
          offsetY = e.clientY - startY;

          // Expand canvas dynamically
          if (offsetX + canvas.width > canvasWidth - 100) {
              canvasWidth += canvas.width;
          }
          if (offsetY + canvas.height > canvasHeight - 100) {
              canvasHeight += canvas.height;
          }

          // Redraw the canvas
          redrawCanvas();
      }

      function redrawCanvas() {
          // Clear the canvas
          context.clearRect(0, 0, canvas.width, canvas.height);

          // Redraw all stored lines
          drawnLines.forEach((line) => {
              drawLine(
                  line.x0,
                  line.y0,
                  line.x1,
                  line.y1,
                  line.color,
                  line.size,
                  line.brushType,
                  line.gradient,
                  line.gradientColors,
                  line.gradientSmoothness,
                  line.tool,
                  false
              );
          });
      }

      // Update color and brush size
      function onColorUpdate(e) {
          current.color = e.target.value;
          updateSelectedSwatch(null);
      }

      function onBrushSizeUpdate(e) {
          current.size = e.target.value;
      }

      function onBrushTypeUpdate(e) {
          current.brushType = e.target.value;
      }

      function onGradientToggle() {
          current.gradient = !current.gradient;
          document.getElementById('gradientBtn').classList.toggle('active', current.gradient);
          document.getElementById('gradientEditor').style.display = current.gradient ? 'flex' : 'none';
      }

      function onGradientStartColorUpdate(e) {
          current.gradientStartColor = e.target.value;
      }

      function onGradientEndColorUpdate(e) {
          current.gradientEndColor = e.target.value;
      }

      function onGradientSmoothnessUpdate(e) {
          current.gradientSmoothness = parseFloat(e.target.value);
      }

      // Handle drawing events from other users
      function onDrawingEvent(data) {
          // Store the line
          drawnLines.push({
              x0: data.x0,
              y0: data.y0,
              x1: data.x1,
              y1: data.y1,
              color: data.color,
              size: data.size,
              brushType: data.brushType,
              gradient: data.gradient,
              gradientColors: data.gradientColors,
              gradientSmoothness: data.gradientSmoothness,
              tool: data.tool,
          });
          // Draw the line
          drawLine(
              data.x0,
              data.y0,
              data.x1,
              data.y1,
              data.color,
              data.size,
              data.brushType,
              data.gradient,
              data.gradientColors,
              data.gradientSmoothness,
              data.tool,
              false
          );
      }

      // Handle cursor move events from other users
      function onCursorMove(data) {
          otherCursors[data.userId] = {
              x: data.x,
              y: data.y,
              username: data.username,
          };
      }

      // Get canvas coordinates considering panning
      function getCanvasCoordinates(e) {
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX || e.touches[0].clientX) - rect.left;
          const y = (e.clientY || e.touches[0].clientY) - rect.top;
          return { x: x, y: y };
      }

      // Throttle function to limit event rate
      function throttle(callback, delay) {
          let previousCall = new Date().getTime();
          return function () {
              const time = new Date().getTime();

              if (time - previousCall >= delay) {
                  previousCall = time;
                  callback.apply(null, arguments);
              }
          };
      }

  }
});
