const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
    "Aug", "Sep", "Oct", "Nov", "Dec"
];
const DAYS_PER_ROW = 37; // 6 weeks x 7 days

function getMonthData(year, month) {
    const firstDate = new Date(year, month, 1);
    const firstDayIdx = (firstDate.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { year, month, firstDayIdx, daysInMonth };
}

function getMonthsList(startDate, endDate) {
    let months = [];
    let y = startDate.getFullYear(), m = startDate.getMonth();
    let endY = endDate.getFullYear(), endM = endDate.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
        months.push({ year: y, month: m });
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return months;
}

function formatDateDMY(date) {
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
}


function getSelectedDates() {
    const startInput = document.getElementById('start-date');
    const endInput = document.getElementById('end-date');
    let startDate = new Date(startInput.value);
    let endDate = new Date(endInput.value);
    // Ensure endDate is after startDate
    if (endDate < startDate) endDate = new Date(startDate);
    return { startDate, endDate };
}

function dateToKey(dt) { // YYYY-MM-DD
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function parseDate(str, contextYear, contextMonth) {
    let [d, m, y] = str.trim().split('/');
    d = parseInt(d, 10);
    m = m !== undefined ? parseInt(m, 10) - 1 : contextMonth;
    y = y !== undefined ? parseInt(y, 10) : ((m < contextMonth) ? (contextYear + 1) : contextYear);
    return new Date(y, m, d);
}
function parseItineraries(text, months) {
    function parseDate(str, year) {
        // str: "25/5" or "25/5/2025"
        let [d, m, y] = str.split('/').map(Number);
        if (!y) y = year;
        return new Date(y, m - 1, d);
    }
    function dateToKey(d) {
        return d.toISOString().slice(0, 10);
    }

    let entries = [];
    let lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    let allDateMap = {};
    let lastTo = null;
    let baseYear = months[0].year;

    for (let i = 0; i < lines.length; ++i) {
        let m = lines[i].match(/^(.+?)\s*-\s*(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\s*-\s*(\d{1,2}\/\d{1,2}(?:\/\d{4})?)$/);
        if (!m) continue;
        let [_, loc, fromStr, toStr] = m;

        let fromExplicit = fromStr.split('/').length === 3;
        let toExplicit = toStr.split('/').length === 3;
        let entryYear = baseYear;
        let from, to;

        // Handle explicit years
        if (fromExplicit && toExplicit) {
            from = parseDate(fromStr);
            to = parseDate(toStr);
        } else {
            while (true) {
                let fromYear = fromExplicit ? undefined : entryYear;
                let toYear = toExplicit ? undefined : entryYear;

                from = parseDate(fromStr, fromYear || baseYear);
                to = parseDate(toStr, toYear || baseYear);

                if (!toExplicit && !fromExplicit && (to < from)) {
                    to = parseDate(toStr, (toYear || baseYear) + 1);
                }

                // Only increment year if 'from' is strictly before lastTo
                if (!lastTo || from >= lastTo) {
                    break;
                }
                entryYear++;
            }
        }

        let fromKey = dateToKey(from), toKey = dateToKey(to);
        entries.push({ loc: loc.trim(), from, to, fromKey, toKey, entryRaw: lines[i] });

        let d = new Date(from);
        while (d < to) { // Only up to the night before the departure day
            let inRange = false;
            for (const mn of months) {
                if (
                    (d.getFullYear() > mn.year || (d.getFullYear() === mn.year && d.getMonth() >= mn.month)) &&
                    (d.getFullYear() < mn.year || (d.getFullYear() === mn.year && d.getMonth() <= mn.month))
                ) { inRange = true; break; }
            }
            if (!inRange) break;
            allDateMap[dateToKey(d)] = { loc: loc.trim(), entryIndex: i, from, to, entryRaw: lines[i], fromKey, toKey };
            d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        }
        lastTo = to;
    }
    return { allDateMap, entries };
}

function buildCalendar(months, wifeMap, husbandMap) {
    let today = new Date(), todayKey = dateToKey(today);
    // Get user-selected range
    const { startDate, endDate } = getSelectedDates();
    let rows = [];
    let header = `<tr><th></th>`;
    for (let i = 0; i < DAYS_PER_ROW; ++i) header += `<th>${WEEKDAYS[i % 7]}</th>`;
    header += `</tr>`;
    rows.push(header);

    months.forEach((mn, mi) => {
        const { year, month, firstDayIdx, daysInMonth } = getMonthData(mn.year, mn.month);
        let cells = [];
        for (let i = 0; i < DAYS_PER_ROW; ++i) {
            let cellDay = i - firstDayIdx + 1;
            let impossible = (i < firstDayIdx || cellDay > daysInMonth);
            let dt = impossible ? null : new Date(year, month, cellDay);
            let cellKey = dt ? dateToKey(dt) : null;
            let classes = [];
            if (impossible) classes.push('impossible');
            // Mark as impossible if outside user-selected range
            if (!impossible) {
                // Normalize times for comparison
                const dtTime = dt.setHours(0, 0, 0, 0);
                const startTime = startDate.setHours(0, 0, 0, 0);
                const endTime = endDate.setHours(0, 0, 0, 0);
                if (dtTime < startTime || dtTime > endTime) {
                    classes.push('impossible');
                }
            }
            if (cellKey === todayKey) classes.push('current-day');
            let cellHTML = '';
            if (!impossible) {
                cellHTML += `<span class="day-num">${cellDay}</span>`;
            }
            cells.push(`<td class="${classes.join(' ')}">${cellHTML}</td>`);
        }
        let row = `<tr>
      <td class="month-label">${MONTHS[month]} ${year}</td>
      ${cells.join('')}
    </tr>`;
        rows.push(row);
    });
    return rows.join('\n');
}

function getCellRects() {
    const table = document.getElementById('calendar-table');
    if (!table) return [];
    let rects = [];
    let trs = table.querySelectorAll('tr:not(:first-child)');
    trs.forEach((tr, mi) => {
        let tds = tr.querySelectorAll('td:not(.month-label)');
        let rowRects = [];
        tds.forEach(td => rowRects.push(td.getBoundingClientRect()));
        rects.push(rowRects);
    });
    return rects;
}

// Overlay itinerary bars as absolutely positioned divs
function overlayItineraryBars(months, wifeEntries, husbandEntries) {
    const overlay = document.getElementById('calendar-overlay-canvas');
    overlay.innerHTML = '';
    const table = document.getElementById('calendar-table');
    if (!table) return;
    const tableRect = table.getBoundingClientRect();
    const rows = table.querySelectorAll('tr:not(:first-child)');
    if (!rows.length) return;

    function isFirstOfNextMonth(date, year, month) {
        // Returns true if date is the 1st of the month after (year, month)
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 11) {
            nextMonth = 0;
            nextYear++;
        }
        return date.getFullYear() === nextYear && date.getMonth() === nextMonth && date.getDate() === 1;
    }

    function overlayBars(entries, role) {
        months.forEach((mn, mi) => {
            const { year, month, firstDayIdx, daysInMonth } = getMonthData(mn.year, mn.month);
            entries.forEach(entry => {
                let entryStart = entry.from, entryEnd = entry.to;
                let mStart = new Date(year, month, 1), mEnd = new Date(year, month, daysInMonth);
                let coversLastDay = false;
                if (isFirstOfNextMonth(entryEnd, year, month) && entryStart <= mEnd) {
                    coversLastDay = true;
                }
                if (entryStart > mEnd || (entryEnd <= mStart && !coversLastDay)) {
                    // Special case: entryEnd is exactly the 1st of this month and entryStart is before mStart
                    if (
                        entryEnd.getFullYear() === year &&
                        entryEnd.getMonth() === month &&
                        entryEnd.getDate() === 1 &&
                        entryStart < mStart
                    ) {
                        // Draw bar for the first actual day of the month (first non-impossible cell)
                        let tr = rows[mi];
                        if (!tr) return;
                        let tds = tr.querySelectorAll('td:not(.month-label)');
                        let td = null;
                        for (let j = 0; j < tds.length; ++j) {
                            if (!tds[j].classList.contains('impossible')) {
                                td = tds[j];
                                break;
                            }
                        }
                        if (!td) return;
                        let parentRect = overlay.parentNode.getBoundingClientRect();
                        let tdRect = td.getBoundingClientRect();
                        let barLeft = tdRect.left - parentRect.left;
                        let barRight = tdRect.right - tdRect.width / 2 - parentRect.left;
                        let barWidth = Math.max(0, barRight - barLeft);
                        let barTop = tdRect.top - parentRect.top + (role === 'wife' ? 20 : tdRect.height - 17);
                        let barHeight = 14;
                        let label = entry.loc.length > 22 ? entry.loc.slice(0, 20) + '…' : entry.loc;
                        let barDiv = document.createElement('div');
                        barDiv.className = `itin-bar-abs ${role}`;
                        barDiv.style.left = `${barLeft}px`;
                        barDiv.style.top = `${barTop}px`;
                        barDiv.style.width = `${barWidth}px`;
                        barDiv.style.height = `${barHeight}px`;
                        barDiv.title = `${role === 'wife' ? 'Leyla' : 'Lee'}: ${entry.loc} (${entry.from.toLocaleDateString()} - ${entry.to.toLocaleDateString()})`;
                        barDiv.innerHTML = `<span class=\"itin-label\">${label}</span>`;
                        overlay.appendChild(barDiv);
                    }
                    return;
                }
                let startDay = Math.max(1, (entryStart > mStart ? entryStart.getDate() : 1));
                let lastBarDate;
                if (coversLastDay) {
                    lastBarDate = mEnd;
                } else {
                    lastBarDate = new Date(Math.min(entryEnd.getTime() - 86400000, mEnd.getTime()));
                }
                if (lastBarDate < mStart) return;
                let endDay = lastBarDate.getDate();
                let startCol = firstDayIdx + startDay - 1;
                let endCol = firstDayIdx + endDay - 1;
                let tr = rows[mi];
                if (!tr) return;
                let tds = tr.querySelectorAll('td:not(.month-label)');
                if (startCol >= tds.length || endCol >= tds.length) return;
                let tdStart = tds[startCol];
                let tdEnd = tds[endCol];
                let parentRect = overlay.parentNode.getBoundingClientRect();
                let tdStartRect = tdStart.getBoundingClientRect();
                let tdEndRect = tdEnd.getBoundingClientRect();
                let barLeft = tdStartRect.left - parentRect.left;
                let barRight = tdEndRect.right - parentRect.left;
                let cellWidth = tdStartRect.width;
                if (entryStart >= mStart && entryStart <= mEnd && entryStart.getFullYear() === year && entryStart.getMonth() === month && startDay === entryStart.getDate()) {
                    barLeft += cellWidth / 2;
                }
                if (!coversLastDay && entryEnd >= mStart && entryEnd <= mEnd && entryEnd.getFullYear() === year && entryEnd.getMonth() === month && endDay === (entryEnd.getDate() - 1)) {
                    barRight -= cellWidth / 2;
                }
                if (!coversLastDay && entryEnd >= mStart && entryEnd <= mEnd && entryEnd.getFullYear() === year && entryEnd.getMonth() === month && endDay === (entryEnd.getDate() - 1)) {
                    barRight = tdEndRect.right - parentRect.left + cellWidth / 2 - 2;
                }
                let barWidth = Math.max(0, barRight - barLeft);
                let barTop = tdStartRect.top - parentRect.top + (role === 'wife' ? 20 : tdStartRect.height - 17);
                let barHeight = 14;
                let label = entry.loc.length > 22 ? entry.loc.slice(0, 20) + '…' : entry.loc;
                let barDiv = document.createElement('div');
                barDiv.className = `itin-bar-abs ${role}`;
                barDiv.style.left = `${barLeft}px`;
                barDiv.style.top = `${barTop}px`;
                barDiv.style.width = `${barWidth}px`;
                barDiv.style.height = `${barHeight}px`;
                barDiv.title = `${role === 'wife' ? 'Leyla' : 'Lee'}: ${entry.loc} (${entry.from.toLocaleDateString()} - ${entry.to.toLocaleDateString()})`;
                barDiv.innerHTML = `<span class=\"itin-label\">${label}</span>`;
                overlay.appendChild(barDiv);
            });
        });
    }
    overlayBars(wifeEntries, 'wife');
    overlayBars(husbandEntries, 'husband');
}

function calcLocationStats(months, personMap) {
    const { startDate, endDate } = getSelectedDates();
    let locationCounts = {};
    let d = new Date(startDate);
    while (d <= endDate) {
        let k = dateToKey(d);
        let loc = personMap[k]?.loc || "London";
        if (!locationCounts[loc]) locationCounts[loc] = 0;
        locationCounts[loc]++;
        d.setDate(d.getDate() + 1);
    }
    return locationCounts;
}

function calcDaysTogetherApart(months, husbandMap, wifeMap) {
    const { startDate, endDate } = getSelectedDates();
    let daysTogether = 0, daysApart = 0;
    let d = new Date(startDate);
    while (d <= endDate) {
        let k = dateToKey(d);
        let hLoc = husbandMap[k]?.loc || "London";
        let wLoc = wifeMap[k]?.loc || "London";
        if (hLoc === wLoc) daysTogether++;
        else daysApart++;
        d.setDate(d.getDate() + 1);
    }
    return { daysTogether, daysApart };
}

function statsToHTMLPerson(stats) {
    return Object.entries(stats)
        .map(([loc, count]) => `<div>${loc}: <strong>${count}</strong></div>`)
        .join('');
}

function statsToHTMLJoint(daysInRange, daysTogether, daysApart, longestTogether, longestApart) {
    return `
    <strong>Days in range:</strong> ${daysInRange}<br>
    <strong>Days together:</strong> ${daysTogether}<br>
    <strong>Days apart:</strong> ${daysApart}<br>
    <strong>Longest consecutive days together:</strong> ${longestTogether}<br>
    <strong>Longest consecutive days apart:</strong> ${longestApart}
  `;
}

function calcLongestStreak(months, husbandMap, wifeMap, together) {
    const { startDate, endDate } = getSelectedDates();
    let d = new Date(startDate);
    let maxStreak = 0, currentStreak = 0;
    while (d <= endDate) {
        let k = dateToKey(d);
        let hLoc = husbandMap[k]?.loc || "London";
        let wLoc = wifeMap[k]?.loc || "London";
        if ((hLoc === wLoc) === together) {
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
            currentStreak = 0;
        }
        d.setDate(d.getDate() + 1);
    }
    return maxStreak;
}

function validateItineraryInput(text, months) {
    const errors = [];
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    let prevTo = null;
    let prevLine = null;
    let baseYear = months[0].year;

    for (let i = 0; i < lines.length; ++i) {
        const line = lines[i];
        const m = line.match(/^(.+?)\s*-\s*(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\s*-\s*(\d{1,2}\/\d{1,2}(?:\/\d{4})?)$/);
        if (!m) {
            errors.push(`Line ${i + 1}: Invalid format. Use "<destination> - <arrive> - <depart>"`);
            continue;
        }
        const [_, loc, fromStr, toStr] = m;
        let from, to;
        try {
            from = parseDate(fromStr, baseYear, 0);
            to = parseDate(toStr, baseYear, 0);
        } catch {
            errors.push(`Line ${i + 1}: Invalid date.`);
            continue;
        }
        if (isNaN(from) || isNaN(to)) {
            errors.push(`Line ${i + 1}: Invalid date.`);
            continue;
        }
        if (to <= from) {
            errors.push(`Line ${i + 1}: Depart date must be after arrive date.`);
        }
        if (prevTo && from < prevTo) {
            errors.push(`Line ${i + 1}: Arrive date must not overlap or be before previous depart date.`);
        }
        prevTo = to;
        prevLine = line;
    }
    return errors;
}

function showValidationErrors(textareaId, errorDivId, months) {
    const textarea = document.getElementById(textareaId);
    const errorDiv = document.getElementById(errorDivId);
    const errors = validateItineraryInput(textarea.value, months);
    if (errors.length) {
        textarea.classList.add('invalid');
        errorDiv.innerHTML = errors.map(e => `<div>${e}</div>`).join('');
    } else {
        textarea.classList.remove('invalid');
        errorDiv.innerHTML = '';
    }
    return errors.length === 0;
}

function updateAll() {
    const { startDate, endDate } = getSelectedDates();
    const months = getMonthsList(startDate, endDate);
    let husbandText = document.getElementById('husband-text').value;
    let wifeText = document.getElementById('wife-text').value;

    // Validate and show errors
    const husbandValid = showValidationErrors('husband-text', 'husband-errors', months);
    const wifeValid = showValidationErrors('wife-text', 'wife-errors', months);

    if (!husbandValid || !wifeValid) return;

    let { allDateMap: husbandMap, entries: husbandEntries } = parseItineraries(husbandText, months);
    let { allDateMap: wifeMap, entries: wifeEntries } = parseItineraries(wifeText, months);
    document.getElementById('calendar-table').innerHTML = buildCalendar(months, wifeMap, husbandMap);
    setTimeout(() => overlayItineraryBars(months, wifeEntries, husbandEntries), 10);
    // Calculate days in range
    const daysInRange = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    // Compute location stats for each person
    const husbandStats = calcLocationStats(months, husbandMap);
    const wifeStats = calcLocationStats(months, wifeMap);
    const { daysTogether, daysApart } = calcDaysTogetherApart(months, husbandMap, wifeMap);
    const longestTogether = calcLongestStreak(months, husbandMap, wifeMap, true);
    const longestApart = calcLongestStreak(months, husbandMap, wifeMap, false);
    document.getElementById('husband-stats').innerHTML = statsToHTMLPerson(husbandStats);
    document.getElementById('wife-stats').innerHTML = statsToHTMLPerson(wifeStats);
    document.getElementById('stats').innerHTML = statsToHTMLJoint(daysInRange, daysTogether, daysApart, longestTogether, longestApart);
}

document.getElementById('husband-text').addEventListener('input', updateAll);
document.getElementById('wife-text').addEventListener('input', updateAll);
document.getElementById('start-date').addEventListener('change', updateAll);
document.getElementById('end-date').addEventListener('change', updateAll);

document.getElementById('save-btn').onclick = async () => {
    const state = {
        startDate: document.getElementById('start-date').value,
        endDate: document.getElementById('end-date').value,
        husbandText: document.getElementById('husband-text').value,
        wifeText: document.getElementById('wife-text').value,
    };
    await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
    });
    alert('Saved!');
};

document.getElementById('load-btn').onclick = async () => {
    const res = await fetch('/api/state');
    const state = await res.json();
    if (state.startDate) document.getElementById('start-date').value = state.startDate;
    if (state.endDate) document.getElementById('end-date').value = state.endDate;
    if (state.husbandText) document.getElementById('husband-text').value = state.husbandText;
    if (state.wifeText) document.getElementById('wife-text').value = state.wifeText;
    updateAll();
};

// Example data
document.getElementById('husband-text').value =
    `Cyprus - 16/6 - 26/6
Cyprus - 11/7 - 25/7
Cyprus - 25/7 - 30/8
Cyprus - 17/9 - 1/10
Cyprus - 11/10 - 7/11
Cyprus - 26/1 - 22/2
Cyprus - 24/3 - 15/4
Cyprus - 10/5 - 6/6
`;

document.getElementById('wife-text').value =
    `Cyprus - 16/6 - 31/8
Ibiza - 5/9 - 8/9
Cyprus - 17/9 - 1/10
Cyprus - 5/10 - 13/11
New York - 13/11 - 21/11
Holiday - 11/12 - 8/1
Cyprus - 26/1 - 10/3
Cyprus - 24/3 - 21/4
Cyprus - 10/5 - 15/6
`;

window.addEventListener('resize', () => setTimeout(updateAll, 50));

// Initial setup
updateAll();