const fs = require("fs");

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function timeToSeconds(timeStr) {
    const parts = timeStr.split(' ');
    const time = parts[0];
    const period = parts[1];
    let [hours, minutes, seconds] = time.split(':').map(Number);
    
    if (period && period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
    else if (period && period.toLowerCase() === 'am' && hours === 12) hours = 0;
    
    return (hours * 3600) + (minutes * 60) + (seconds || 0);
}

function secondsToTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getShiftDuration(startTime, endTime) {
    let durationSecs = timeToSeconds(endTime) - timeToSeconds(startTime);
    if (durationSecs < 0) durationSecs += 86400;
    return secondsToTime(durationSecs);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let start = timeToSeconds(startTime);
    let end = timeToSeconds(endTime);

    if (end < start) {
        end += 86400; 
    }

    let idleSecs = 0;
    const eightAM = 28800; 
    const tenPM = 79200;   

    if (start < eightAM) {
        idleSecs += Math.min(end, eightAM) - start;
    }

    if (end > tenPM) {
        let nightStart = Math.max(start, tenPM);
        let nightEnd = Math.min(end, eightAM + 86400); 
        
        if (nightEnd > nightStart) {
            idleSecs += nightEnd - nightStart;
        }
    }

    return secondsToTime(idleSecs);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const activeSecs = timeToSeconds(shiftDuration) - timeToSeconds(idleTime);
    return secondsToTime(activeSecs);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const activeSecs = timeToSeconds(activeTime);
    const isEid = date >= "2025-04-10" && date <= "2025-04-30";
    const requiredSecs = isEid ? 21600 : 30240;

    return activeSecs >= requiredSecs;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const fileData = fs.readFileSync(textFile, "utf8").trim().split("\n");
    const headers = fileData[0];
    let records = fileData.slice(1);

    for (let i = 0; i < records.length; i++) {
        const columns = records[i].split(",");
        if (columns[0] === shiftObj.driverID && columns[2] === shiftObj.date) {
            return {};
        }
    }

    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quotaMet = metQuota(shiftObj.date, activeTime);

    const fullObj = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };

    const newRow = `${fullObj.driverID},${fullObj.driverName},${fullObj.date},${fullObj.startTime},${fullObj.endTime},${fullObj.shiftDuration},${fullObj.idleTime},${fullObj.activeTime},${fullObj.metQuota},${fullObj.hasBonus}`;
    
    records.push(newRow);

    records.sort((a, b) => {
        const dateA = a.split(",")[2];
        const dateB = b.split(",")[2];
        if (dateA === dateB) {
            return a.split(",")[0].localeCompare(b.split(",")[0]);
        }
        return dateA.localeCompare(dateB);
    });

    fs.writeFileSync(textFile, [headers, ...records].join("\n"), "utf8");

    return fullObj;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    for (let i = 1; i < lines.length; i++) {
        let cols = lines[i].split(",");
        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = newValue;
            lines[i] = cols.join(",");
            break;
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"), "utf8");
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const lines = fs.readFileSync(textFile, "utf8").trim().split("\n").slice(1);
    let driverFound = false;
    let tally = 0;
    const targetMonth = String(month).padStart(2, '0');

    for (let i = 0; i < lines.length; i++) {
        const columns = lines[i].split(",");
        
        if (columns[0] === driverID) {
            driverFound = true;
            const recordMonth = columns[2].split("-")[1];
            
            if (recordMonth === targetMonth && columns[9].trim() === "true") {
                tally++;
            }
        }
    }

    return driverFound ? tally : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const lines = fs.readFileSync(textFile, "utf8").trim().split("\n").slice(1);
    const targetMonth = String(month).padStart(2, '0');
    let totalSecs = 0;

    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols[0] === driverID && cols[2].split("-")[1] === targetMonth) {
            totalSecs += timeToSeconds(cols[7]);
        }
    }

    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const lines = fs.readFileSync(textFile, "utf8").trim().split("\n").slice(1);
    const targetMonth = String(month).padStart(2, '0');
    let totalRequiredSecs = 0;

    for (let line of lines) {
        const cols = line.split(",");
        if (cols[0] === driverID && cols[2].split("-")[1] === targetMonth) {
            const date = cols[2];
            const isEid = date >= "2025-04-10" && date <= "2025-04-30";
            totalRequiredSecs += isEid ? 21600 : 30240;
        }
    }

    totalRequiredSecs -= (bonusCount * 7200);

    if (totalRequiredSecs < 0) totalRequiredSecs = 0;

    const h = Math.floor(totalRequiredSecs / 3600);
    const m = Math.floor((totalRequiredSecs % 3600) / 60);
    const s = totalRequiredSecs % 60;

    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rates = fs.readFileSync(rateFile, "utf8").trim().split("\n");
    let salary = 0;
    let tier = 1;

    for (let line of rates) {
        const data = line.split(",");
        if (data[0] === driverID) {
            salary = parseFloat(data[2]);
            tier = parseFloat(data[3]);
            break;
        }
    }

    const actualSecs = timeToSeconds(actualHours);
    const reqSecs = timeToSeconds(requiredHours);

    if (actualSecs >= reqSecs) return Math.round(salary);

    const missedSecs = reqSecs - actualSecs;
    const allowanceSecs = tier * 10 * 3600; 

    if (missedSecs <= allowanceSecs) return Math.round(salary);

   
    const penalty = (missedSecs / 3600) * 7.5;

    return Math.round(salary - penalty);
}


module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
