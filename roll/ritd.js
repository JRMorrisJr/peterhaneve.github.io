var shipboxes = [ 'shipbs', 'shipcruiser' ];
var whboxes = [ 'whstatfull', 'whstathalf', 'whstatcrit' ];
var whstatustext = [ 'full mass', 'half mass', 'critical mass' ];
var whdata = {
	'K162': { 'dest': '' },
	'N432': { 'dest': 'Null', 'per': 300.0, 'total': 3000.0 },
	'S805': { 'dest': 'C5', 'per': 1350.0, 'total': 3000.0 }
};
var shipdata = {
	'bs': { 'cold': 196.8, 'hot': 296.8 },
	'cruiser': { 'cold': 23.82, 'hot': 123.82 },
};
var logEvents = [], directive = null;

// Reports the ID code of the active ship type for rolling
function activeShip() {
	var mainForm = document.forms[0], ship = '', shipType = mainForm.shiptype;
	for (var i = 0; i < shipType.length && ship === ''; i++) {
		var st = shipType[i];
		if (st.checked)
			ship = st.value;
	}
	return ship;
}

// No support for IE5, netscape, etc.
function byId(id) {
	return document.getElementById(id);
}

// Formats a mass value for display - can be changed to 'M kg' if necessary
function gg(value) {
	if (!value)
		value = 0;
	return value.toFixed(0) + ' GG';
}

// Generates an event describing an initial mass update
// level 0 is full, 1 is half, 2 is crit
function initialMassEvent(whinfo, level) {
	var minMass = 0.0, maxMass = 0.0;
	if (level === 2) {
		// Lowest case: almost gone
		minMass = 1.0;
		// Highest case: +10% total mass at 10% of original mass
		maxMass = whinfo.total * 0.11;
	} else if (level === 1) {
		// Lowest case: -10% total mass at 10% + 1 of original mass
		minMass = whinfo.total * 0.09 + 1.0;
		// Highest case: +10% total mass at 50% of original mass
		maxMass = whinfo.total * 0.55;
	} else {
		// Lowest case: -10% total mass at 50% + 1 of original mass
		minMass = whinfo.total * 0.45 + 1.0;
		// Highest case: +10% 
		maxMass = whinfo.total * 1.1;
	}
	return { 'action': 'mass', 'minMass': minMass, 'maxMass': maxMass, 'level': level,
		'hot': false, 'minMassRaw': minMass, 'maxMassRaw': maxMass };
}

// Calculates the next step to roll the hole closer
function calculate() {
	var mainForm = document.forms[0], ship = activeShip();
	var code = mainForm.whtype.value, shipinfo = shipdata[ship], whinfo = whdata[code];
	var logLen = logEvents.length;
	if (shipinfo && whinfo && logLen > 0) {
		// Get mass in GG, cold and hot
		var cold = shipinfo.cold, hot = shipinfo.hot, decision = 'STOP', temp = false, mass;
		var item = logEvents[logLen - 1], minMass = item.minMass, maxMass = item.maxMass;
		var dirField = byId('direction'), tempField = byId('temperature'), out = true;
		var level = item.level, massRange = initialMassEvent(whinfo, level);
		// Find out the last direction by backwards iterating the log looking for 'out', 'in'
		for (var i = logLen - 1; i >= 0; i--) {
			var action = logEvents[i].action;
			if (action === 'out') {
				// Coming back in
				out = false;
				break;
			} else if (action === 'in')
				// Going out
				break;
		}
		if (cold > whinfo.per) {
			// If ship is too big for this wormhole, say so
			decision = 'ERROR';
			dirField.title = 'Chosen ship is too large for this wormhole';
		} else if (minMass <= cold) {
			if (out)
				// If going out cold is too risky, say stop
				dirField.title = 'Use a smaller ship to finish rolling this wormhole';
			else {
				// Roll that hole!
				decision = 'IN';
				temp = true;
			}
		} else if (minMass > 2 * hot + cold || (minMass > hot && minMass <= 2 * hot)) {
			// Go hot if you will not get stuck and you can go back
			decision = out ? 'OUT' : 'IN';
			temp = true;
		} else {
			// Go out cold
			decision = out ? 'OUT' : 'IN';
			temp = false;
		}
		// Update fields in the UI
		dirField.innerHTML = decision;
		tempField.innerHTML = temp ? 'HOT' : 'COLD';
		// Update tool tips
		if (decision === 'OUT')
			dirField.title = 'Jump wormhole into hostile space';
		else if (decision === 'IN')
			dirField.title = 'Jump wormhole into friendly space';
		tempField.title = 'Jump wormhole with propulsion module ' + (temp ? 'ON' : 'OFF');
		// Store event to avoid recalculations
		mass = temp ? hot : cold;
		minMass -= mass;
		maxMass -= mass;
		var minMassNew = Math.max(minMass, massRange.minMass);
		var maxMassNew = Math.max(minMassNew, Math.min(maxMass, massRange.maxMass));
		// Only allow clicking the button if the wormhole should be jumped
		if (decision === 'OUT' || decision === 'IN')
			directive = { 'action': out ? 'out' : 'in', 'hot': temp ? true : false,
				'mass': mass, 'minMass': minMassNew, 'maxMass': maxMassNew, 'level': level,
				'minMassRaw': minMass, 'maxMassRaw': maxMass };
		else
			directive = null;
	} else
		directive = null;
}

function changeMass() {
	var mainForm = document.forms[0], code = mainForm.whtype.value;
	var whinfo = whdata[code], logLen = logEvents.length, massLeft = mainForm.whstatus;
	if (logLen > 0) {
		var index = 0, newItem;
		// Find selected checkbox
		for (var i = 0; i < massLeft.length; i++)
			if (massLeft[i].checked) {
				index = i;
				break;
			}
		newItem = initialMassEvent(whinfo, index);
		if (logLen < 2)
			// Hole started out with this mass, do not use the reshrink logic
			logEvents = [ newItem ];
		else {
			var item = logEvents[logLen - 1], minMass, maxMass;
			// Add new event if the last event was not a mass event
			if (item.action !== 'mass') {
				logEvents.push(newItem);
				logLen++;
			}
			// Look at the event before that one to find the mass range
			item = logEvents[logLen - 2];
			minMass = item.minMassRaw;
			maxMass = item.maxMassRaw;
			// Use what is known about plausible masses
			if (newItem.minMass < minMass)
				newItem.minMass = minMass;
			if (newItem.maxMass > maxMass)
				newItem.maxMass = maxMass;
			// Update array (apparently does it by value...)
			logEvents[logLen - 1] = newItem;
		}
	}
	update();
}

// Displays the log of actions taken so far, reconstructed from the log array
function dispLog() {
	var mainForm = document.forms[0], code = mainForm.whtype.value, whinfo = whdata[code];
	var logLen = logEvents.length;
	if (whinfo && logLen > 0) {
		// Create user log text
		var logStr = "Rolling In The Deep 1.0\r\n\r\nWormhole " + code + "\r\n";
		for (var i = 0; i < logLen; i++) {
			var item = logEvents[i], action = item.action;
			if (action === 'mass') {
				// Mass change
				var newLevel = item.level, oldLevel = newLevel;
				if (i > 0)
					oldLevel = logEvents[i - 1].level;
				if (oldLevel != newLevel)
					// Hole shrunk
					logStr += 'Wormhole is now ' + whstatustext[newLevel] + "!\r\n";
				logStr += 'Mass: ' + gg(item.minMass) + ' to ' + gg(item.maxMass) + "\r\n";
			} else if (action === 'out' || action === 'in')
				// Wormhole jumped
				logStr += 'Jumped ' + action + ' ' + (item.hot ? 'HOT' : 'COLD') + ', -' +
					gg(item.mass) + "\r\n";
		}
		// Update text and scroll to bottom
		var logForm = mainForm.log;
		logForm.value = logStr;
		logForm.scrollTop = logForm.scrollHeight
	}
}

function init() {
	var mainForm = document.forms[0], whlist = mainForm.whtype;
	// Add all of the WH options to the drop down
	for (var code in whdata) {
		var info = whdata[code];
		whlist.options.add(new Option(code, code));
	}
	whlist.focus();
	loadWH();
}

// Jumps the hole, subtracting the mass
function jump() {
	// Use precalculated event
	if (directive && directive !== 0) {
		logEvents.push(directive);
		directive = null;
		update();
	}
}

// Loads the selected wormhole information into the page and clears the log
function loadWH() {
	var mainForm = document.forms[0], code = mainForm.whtype.value;
	var whinfo = whdata[code], error = true;
	// Not an exit?
	if (code != 'K162' && whinfo) {
		error = false;
		// No escaping issues since content is known
		byId('leadsto').innerHTML = whinfo.dest;
		byId('maxper').innerHTML = gg(whinfo.per);
		byId('totalmass').innerHTML = gg(whinfo.total);
		// Switch to full mass
		mainForm.whstatus[0].checked = true;
		// Clear the log
		logEvents = [ initialMassEvent(whinfo, 0) ];
	}
	// Display error if K162 selected
	byId('k162warning').style.display = error ? 'block' : 'none';
	update();
}

// Updates the screen, displaying the selected options and the current status / decision
function update() {
	var mainForm = document.forms[0], massLeft = mainForm.whstatus;
	var shipType = mainForm.shiptype, minMass = 0.0, maxMass = 0.0, logLen = logEvents.length;
	// Mass left selection
	for (var i = 0; i < whboxes.length; i++) {
		var btn = byId(whboxes[i]);
		if (massLeft[i].checked)
			btn.classList.add('selected');
		else
			btn.classList.remove('selected');
	}
	// Ship type selection
	for (var i = 0; i < shipboxes.length; i++) {
		var btn = byId(shipboxes[i]);
		if (shipType[i].checked)
			btn.classList.add('selected');
		else
			btn.classList.remove('selected');
	}
	// Update display of masses
	if (logLen > 0) {
		minMass = logEvents[logLen - 1].minMass;
		maxMass = logEvents[logLen - 1].maxMass;
	}
	// If the hole was paved, say so
	if (minMass < 1 || maxMass < 1)
		minMass = maxMass = 0;
	byId('massmin').innerHTML = gg(minMass);
	byId('massmax').innerHTML = gg(maxMass);
	// Update decision
	calculate();
	dispLog();
}
