window.frames_drawn = 0;
function tick() { window.frames_drawn++; requestAnimationFrame(tick); }
requestAnimationFrame(tick);
scenery.on("note", function () { render(); }); scenery.on("props", function () { render(); });
function render() { document.getElementById("o").textContent = "external script ok · size=" + scenery.props.size + " mode=" + scenery.props.mode + " note=" + JSON.stringify(scenery.note); }
