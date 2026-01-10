// Configuration
const SHEET_ID = '1IshovQni9Eiq9IeRdDg_2cXTSSkC7YIK2fbDTm_dcs0';
const SHEET_NAME = 'booking';
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby0F2uWTTm4S-zmrBzVdvPsgcvZTj5PpMD1XboPNH7_ULo8Ii5xRvGhFgtfEeVxyih5BA/exec';

// ✅ Google Apps Script Web App URL ได้ถูกตั้งค่าแล้ว
// เว็บจะใช้วิธีนี้ในการดึงข้อมูล (แก้ปัญหา CORS แล้ว)

// House names mapping
const HOUSE_NAMES = [
    'ฮอมฮัก', 'ซอมนา', 'อุ่นละมุน', 'เพียงตะวัน', 'อินทอง',
    'ผาหมวกผาหนอง', 'ภูสอยดาว', 'ภูไก่ห้อย', 'ภูหัวฮ่อม', 'ภูสวนทราย',
    'ภูเก้าง้อม', 'ศรีเพชร', 'ธารสวรรค์', 'นาHugหลาย', 'เคียงดาว'
];

const SPLIT_COLUMNS = [
    'SPLIT_HBK1', 'SPLIT_HBK2', 'SPLIT_HBK3', 'SPLIT_HBK4', 'SPLIT_HBK5',
    'SPLIT_HBK6', 'SPLIT_HBK7', 'SPLIT_HBK8', 'SPLIT_HBK9', 'SPLIT_HBK10',
    'SPLIT_HBK11', 'SPLIT_HBK12', 'SPLIT_HBK13', 'SPLIT_HBK14', 'SPLIT_HBK15'
];

// Cache and pagination
let cachedBookings = null;
let currentPage = 1;
const ROWS_PER_PAGE = 30;
let totalPages = 1;
let selectedMonth = null; // Format: 'YYYY-MM' or 'all', default will be current month

let deferredPrompt;

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBanner = document.getElementById('installBanner');
    if (installBanner) {
        installBanner.classList.add('show');
    }
});

const installBtn = document.getElementById('installBtn');
if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            const installBanner = document.getElementById('installBanner');
            if (installBanner) {
                installBanner.classList.remove('show');
            }
        }
    });
}

// Parse date from various formats
function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // If already a Date object
    if (dateStr instanceof Date) {
        return new Date(dateStr);
    }
    
    // Convert to string
    const str = String(dateStr).trim();
    if (!str) return null;
    
    // Thai month abbreviations mapping
    const thaiMonths = {
        'ม.ค.': 0, 'มกราคม': 0, 'ก.พ.': 1, 'กุมภาพันธ์': 1,
        'มี.ค.': 2, 'มีนาคม': 2, 'เม.ย.': 3, 'เมษายน': 3,
        'พ.ค.': 4, 'พฤษภาคม': 4, 'มิ.ย.': 5, 'มิถุนายน': 5,
        'ก.ค.': 6, 'กรกฎาคม': 6, 'ส.ค.': 7, 'สิงหาคม': 7,
        'ก.ย.': 8, 'กันยายน': 8, 'ต.ค.': 9, 'ตุลาคม': 9,
        'พ.ย.': 10, 'พฤศจิกายน': 10, 'ธ.ค.': 11, 'ธันวาคม': 11
    };
    
    // Try Thai format: 29-พ.ย.-2568 or 29 พ.ย. 2568 or 29/พ.ย./2568
    const thaiFormat = /^(\d{1,2})[-\/\s]*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\.?[-\/\s]*(\d{4})$/i;
    const thaiMatch = str.match(thaiFormat);
    
    if (thaiMatch) {
        const day = parseInt(thaiMatch[1]);
        let monthStr = thaiMatch[2];
        
        // Normalize month string
        if (!monthStr.endsWith('.') && monthStr.length <= 4) {
            monthStr = monthStr + '.';
        }
        
        const yearBE = parseInt(thaiMatch[3]);
        
        // Convert Buddhist Era to Christian Era (if year > 2400, it's BE)
        const year = yearBE > 2400 ? yearBE - 543 : yearBE;
        
        // Find month
        const month = thaiMonths[monthStr] ?? thaiMonths[monthStr.toLowerCase()];
        
        if (month !== undefined && day >= 1 && day <= 31) {
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
    }
    
    // Try ISO date format (from Google Sheets API)
    const isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
        return isoDate;
    }
    
    // Try different numeric date formats
    const formats = [
        // DD/MM/YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        // DD-MM-YYYY
        /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
        // YYYY-MM-DD
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        // YYYY/MM/DD
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
    ];
    
    for (let format of formats) {
        const match = str.match(format);
        if (match) {
            let year, month, day;
            
            if (format.source.startsWith('^(\\d{4})')) {
                // YYYY-MM-DD or YYYY/MM/DD format
                year = parseInt(match[1]);
                month = parseInt(match[2]);
                day = parseInt(match[3]);
            } else {
                // DD/MM/YYYY or DD-MM-YYYY format
                day = parseInt(match[1]);
                month = parseInt(match[2]);
                year = parseInt(match[3]);
                
                // Convert BE to CE if needed
                if (year > 2400) {
                    year = year - 543;
                }
            }
            
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const date = new Date(year, month - 1, day);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
        }
    }
    
    return null;
}

// Format date to Thai format - แสดงเฉพาะวันและวันที่
function formatDateThai(date) {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 
                    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${date.getDate()}-${months[date.getMonth()]}`;
}

// ฟังก์ชันเดิม - แสดงแค่วันอาทิตย์และวันที่
// function formatDateThai(date) {
//     const days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
//     return `${days[date.getDay()]} ${date.getDate()}`;
// }

// Fetch data from Google Sheets
async function fetchSheetData() {
    try {
        // Method 1: Try Web App URL first (recommended - แก้ปัญหา CORS)
        if (WEB_APP_URL && WEB_APP_URL !== 'YOUR_WEB_APP_URL_HERE') {
            console.log('🚀 Method 1: Fetching from Google Apps Script Web App...');
            console.log('URL:', WEB_APP_URL);
            
            try {
                const response = await fetch(WEB_APP_URL, {
                    method: 'GET',
                    cache: 'no-cache'
                });
                
                console.log('Response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`HTTP Error ${response.status}`);
                }
                
                const jsonData = await response.json();
                console.log('✅ JSON data loaded successfully!');
                console.log('Data rows:', jsonData.data ? jsonData.data.length : 0);
                
                if (!jsonData.success) {
                    throw new Error(jsonData.error || 'Failed to fetch data from Web App');
                }
                
                return {
                    headers: jsonData.headers,
                    data: jsonData.data.map(row => {
                        // Convert to string values
                        const obj = {};
                        Object.keys(row).forEach(key => {
                            obj[key] = row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
                        });
                        return obj;
                    })
                };
            } catch (webAppError) {
                console.error('❌ Web App method failed:', webAppError);
                console.log('⚠️ Falling back to CSV method...');
                // Fall through to CSV method
            }
        } else {
            console.log('⚠️ WEB_APP_URL not configured, using CSV method');
        }
        
        // Method 2: Fallback to CSV export (มีปัญหา CORS บางครั้ง)
        console.log('📥 Method 2: Trying CSV export...');
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
        
        console.log('CSV URL:', csvUrl);
        
        const response = await fetch(csvUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ไม่สามารถเชื่อมต่อ Google Sheet ได้\n\n💡 แนะนำ: ใช้ Google Apps Script แทนเพื่อแก้ปัญหา CORS\nดูวิธีติดตั้งที่ SETUP_APPS_SCRIPT.md`);
        }
        
        const csvText = await response.text();
        console.log('CSV length:', csvText.length);
        
        if (!csvText || csvText.length < 10) {
            throw new Error('ไม่มีข้อมูลใน Google Sheet หรือ Sheet ไม่เป็น Public\n\n💡 วิธีแก้:\n1. ตรวจสอบว่า Google Sheet เป็น Public\n2. หรือใช้ Google Apps Script (แนะนำ)');
        }
        
        console.log('✅ CSV loaded successfully!');
        return parseCSV(csvText);
        
    } catch (error) {
        console.error('❌ Error fetching data:', error);
        throw error;
    }
}

// Parse CSV data
function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return { headers, data };
}

// Parse CSV line (handle quoted values)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result;
}

// Get date range for bookings
function getDateRange(bookings) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Set reasonable max date (2 years from today)
    const reasonableMaxDate = new Date(today);
    reasonableMaxDate.setFullYear(reasonableMaxDate.getFullYear() + 2);
    
    let maxDate = new Date(today);
    let invalidDatesCount = 0;
    let latestValidDate = null;
    
    bookings.forEach(booking => {
        const checkOut = parseDate(booking['Date_ck_out']);
        
        if (checkOut) {
            // Check if date is reasonable (not too far in the future, not in the past before 1900)
            const yearDiff = checkOut.getFullYear() - today.getFullYear();
            
            if (checkOut < new Date(1900, 0, 1)) {
                // Date too far in the past
                console.warn(`⚠️ Skipping invalid date (too old): ${booking['Date_ck_out']}`);
                invalidDatesCount++;
            } else if (yearDiff > 10) {
                // Date more than 10 years in the future - likely wrong
                console.warn(`⚠️ Skipping invalid date (too far future): ${booking['Date_ck_out']} → Year ${checkOut.getFullYear()}`);
                invalidDatesCount++;
            } else if (checkOut > today && checkOut <= reasonableMaxDate) {
                // Valid future date within 2 years
                if (checkOut > maxDate) {
                    maxDate = checkOut;
                    latestValidDate = booking['Date_ck_out'];
                }
            } else if (checkOut > reasonableMaxDate) {
                // Date beyond 2 years - cap it
                console.warn(`⚠️ Date beyond 2 years: ${booking['Date_ck_out']}, capping to 2 years`);
                invalidDatesCount++;
            }
        }
    });
    
    if (invalidDatesCount > 0) {
        console.warn(`⚠️ Found ${invalidDatesCount} invalid dates in bookings`);
        console.log(`💡 Latest valid date found: ${latestValidDate || 'none'}`);
    }
    
    // If no valid future dates found, use 90 days as default
    if (maxDate.getTime() === today.getTime()) {
        console.log('📅 No valid future dates found, using 90 days as default');
        maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + 90);
    }
    
    const dates = [];
    const currentDate = new Date(today);
    
    while (currentDate <= maxDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
}

// Check if date is in booking range (with enhanced debug)
function isDateInBooking(date, checkIn, checkOut) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    const ci = parseDate(checkIn);
    const co = parseDate(checkOut);
    
    if (!ci || !co) {
        // Debug: show when parse fails
        const debugCount = window.dateParseErrors || 0;
        if (debugCount < 5) {
            console.warn('⚠️ Cannot parse dates:');
            if (!ci) console.warn('  - Check-in:', checkIn);
            if (!co) console.warn('  - Check-out:', checkOut);
            window.dateParseErrors = debugCount + 1;
        }
        return false;
    }
    
    ci.setHours(0, 0, 0, 0);
    co.setHours(0, 0, 0, 0);
    
    // Check if date is within booking range
    // d >= ci: includes check-in date
    // d < co: excludes check-out date (standard hotel practice)
    // Example: Check-in 1 Dec, Check-out 3 Dec → Guest stays on 1 Dec and 2 Dec (not 3 Dec)
    const isInRange = d >= ci && d < co;
    
    // Debug: show first few comparisons
    const debugCount = window.dateDebugCount || 0;
    if (debugCount < 10 && isInRange) {
        const nights = Math.floor((co - ci) / (1000 * 60 * 60 * 24));
        console.log('🔍 Date in booking range:', {
            date: d.toISOString().split('T')[0],
            dateThai: formatDateThai(d),
            checkIn: ci.toISOString().split('T')[0],
            checkInThai: checkIn,
            checkOut: co.toISOString().split('T')[0],
            checkOutThai: checkOut,
            nights: nights,
            isInRange: isInRange,
            comparison: `${d.getTime()} >= ${ci.getTime()} && ${d.getTime()} < ${co.getTime()}`
        });
        window.dateDebugCount = debugCount + 1;
    }
    
    return isInRange;
}

// นับจำนวนบ้านที่มีการจองในวันที่ที่กำหนด
function countHousesBookedOnDate(date, bookings) {
    const bookedHouses = new Set(); // ใช้ Set เพื่อหาบ้านที่ไม่ซ้ำกัน
    
    bookings.forEach(booking => {
        // เช็คว่าวันที่นี้อยู่ในช่วงการจอง
        if (isDateInBooking(date, booking['Date_ck_in'], booking['Date_ck_out'])) {
            // ดึงชื่อบ้านจาก House_bk
            const houseBk = booking['House_bk'] || '';
            
            // หาบ้านทั้งหมดที่ถูกจองในการจองนี้
            HOUSE_NAMES.forEach(houseName => {
                if (houseBk.includes(houseName)) {
                    bookedHouses.add(houseName);
                }
            });
        }
    });
    
    return bookedHouses.size;
}

// Build booking table with pagination
function buildBookingTable(sheetData, page = 1) {
    console.log(`📊 Building booking table for page ${page}...`);
    const { data } = sheetData;
    
    console.log('Total data rows:', data.length);
    
    // Filter valid bookings
    const bookings = data.filter(row => {
        const hasCheckIn = row['Date_ck_in'] && row['Date_ck_in'] !== '';
        const hasCheckOut = row['Date_ck_out'] && row['Date_ck_out'] !== '';
        return hasCheckIn && hasCheckOut;
    });
    
    console.log('✅ Valid bookings (with dates):', bookings.length);
    
    if (bookings.length === 0) {
        return `
            <div class="error">
                <h3>ℹ️ ไม่มีข้อมูลการจอง</h3>
                <p>ไม่พบข้อมูลการจองที่มี Date_ck_in และ Date_ck_out</p>
                <p style="margin-top: 10px; font-size: 13px;">
                    กรุณาตรวจสอบข้อมูลใน Google Sheet
                </p>
            </div>
        `;
    }
    
    // Check how many bookings have house info
    const bookingsWithHouse = bookings.filter(row => {
        // Use House_bk column instead of SPLIT_HBK columns
        return row['House_bk'] && 
               row['House_bk'] !== '' && 
               row['House_bk'] !== 'undefined' && 
               row['House_bk'] !== 'null';
    });
    
    console.log('✅ Bookings with house info:', bookingsWithHouse.length);
    
    if (bookingsWithHouse.length === 0) {
        console.warn('⚠️ No bookings have house information in House_bk column!');
        console.log('Sample booking:', bookings[0]);
        
        return `
            <div class="warning">
                <h3>⚠️ ไม่พบข้อมูลบ้านพัก</h3>
                <p>พบข้อมูลการจอง ${bookings.length} แถว แต่ไม่มีข้อมูลในคอลัมน์ House_bk</p>
                <p style="margin-top: 10px; font-size: 13px;">
                    <strong>วิธีแก้:</strong><br>
                    1. เปิดหน้า <a href="debug-sheet-data.html" target="_blank">debug-sheet-data.html</a><br>
                    2. ดูว่าคอลัมน์ House_bk มีข้อมูลหรือไม่<br>
                    3. คอลัมน์นี้ใช้ระบุว่าการจองนั้นจองบ้านไหน
                </p>
            </div>
        `;
    }
    
    // Sample House_bk values for debugging
    console.log('Sample House_bk values:');
    const sampleBookings = bookingsWithHouse.slice(0, 5);
    sampleBookings.forEach((b, i) => {
        console.log(`  Booking ${i + 1}: "${b['House_bk']}"`);
    });
    
    // Cache bookings for pagination (use bookingsWithHouse instead of all bookings)
    cachedBookings = bookingsWithHouse.length > 0 ? bookingsWithHouse : bookings;
    
    // Get date range
    console.log('Getting date range...');
    let dates = getDateRange(bookingsWithHouse.length > 0 ? bookingsWithHouse : bookings);
    console.log('Total date range:', dates.length, 'days');
    
    // Populate month filter dropdown first (needs all dates)
    populateMonthFilter(dates);
    
    // Then apply month filter
    if (selectedMonth && selectedMonth !== 'all') {
        const [filterYear, filterMonth] = selectedMonth.split('-').map(Number);
        dates = dates.filter(date => {
            const dateMonth = date.getMonth(); // 0-11
            const dateYear = date.getFullYear() + 543; // Convert to BE
            return dateMonth === filterMonth && dateYear === filterYear;
        });
        console.log(`📆 Filtered to month ${selectedMonth}: ${dates.length} days`);
    }
    
    // Calculate pagination
    totalPages = Math.ceil(dates.length / ROWS_PER_PAGE);
    currentPage = Math.min(page, totalPages);
    
    const startIdx = (currentPage - 1) * ROWS_PER_PAGE;
    const endIdx = Math.min(startIdx + ROWS_PER_PAGE, dates.length);
    const pageDates = dates.slice(startIdx, endIdx);
    
    console.log(`Rendering rows ${startIdx + 1}-${endIdx} of ${dates.length} (Page ${currentPage}/${totalPages})`);
    
    // Update pagination UI
    updatePaginationUI();
    
    // Build table HTML efficiently
    console.log('Building HTML table...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Use array join for better performance
    const rows = [];
    
    // Header row
    let headerRow = '<tr><th class="date-column">วันที่</th>';
    HOUSE_NAMES.forEach(houseName => {
        headerRow += `<th>${houseName}</th>`;
    });
    headerRow += '</tr>';
    
    // Body rows
    pageDates.forEach((date, idx) => {
        const isToday = date.getTime() === today.getTime();
        
        // นับจำนวนบ้านที่มีการจองในวันนี้
        const bookedHousesCount = countHousesBookedOnDate(date, bookingsWithHouse);
        
        // สร้าง badge แสดงจำนวนบ้าน
        let dateBadge = '';
        if (bookedHousesCount > 0) {
            const badgeColor = bookedHousesCount >= 10 ? '#dc2626' : 
                              bookedHousesCount >= 5 ? '#ea580c' : 
                              '#059669';
            dateBadge = `
                <div style="
                    margin-top: 6px; 
                    padding: 4px 10px; 
                    background: ${badgeColor}; 
                    color: white; 
                    border-radius: 8px; 
                    font-size: 11px; 
                    font-weight: 600;
                    display: block;
                    text-align: center;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                ">
                    มีจอง ${bookedHousesCount} หลัง
                </div>
            `;
        }
        
        let row = '<tr>';
        row += `<td class="date-cell ${isToday ? 'today-row' : ''}">
            <div style="text-align: center;">
                ${formatDateThai(date)}
            </div>
            ${dateBadge}
        </td>`;
        
        // Check each house for bookings on this date
        HOUSE_NAMES.forEach((houseName, houseIdx) => {
            const cellBookings = [];
            
            // Collect all bookings for this house on this date
            bookingsWithHouse.forEach(booking => {
                // Check if this house is in the House_bk column
                const houseBk = booking['House_bk'] || '';
                const hasThisHouse = houseBk.includes(houseName);
                
                if (hasThisHouse && isDateInBooking(date, booking['Date_ck_in'], booking['Date_ck_out'])) {
                    cellBookings.push(booking);
                }
            });
            
            if (cellBookings.length > 0) {
                let cellContent = '';
                
                // ✅ FIXED: Remove duplicates - แสดงเฉพาะ booking ที่ไม่ซ้ำกัน
                // Group by unique booking (same customer, phone, dates, house)
                const uniqueBookings = new Map();
                
                cellBookings.forEach(booking => {
                    // Create unique key using customer + phone + dates + this specific house
                    const checkIn = booking['Date_ck_in'] || '';
                    const checkOut = booking['Date_ck_out'] || '';
                    const key = `${booking['Customer']}_${booking['Phone_no']}_${checkIn}_${checkOut}_${houseName}`;
                    
                    // Only keep first occurrence
                    if (!uniqueBookings.has(key)) {
                        uniqueBookings.set(key, booking);
                        
                        // Debug first match
                        if (idx === 0 && houseIdx === 0 && uniqueBookings.size === 1) {
                            console.log(`✅ Found unique booking:`, {
                                date: formatDateThai(date),
                                house: houseName,
                                customer: booking['Customer'],
                                checkIn: checkIn,
                                checkOut: checkOut
                            });
                        }
                    }
                });
                
                uniqueBookings.forEach((booking) => {
                    // Get houses from House_bk column
                    const houseBk = booking['House_bk'] || '';
                    const housesBooked = HOUSE_NAMES.filter(house => houseBk.includes(house));
                    
                    // Calculate number of nights
                    let numNights = 0;
                    const checkIn = parseDate(booking['Date_ck_in']);
                    const checkOut = parseDate(booking['Date_ck_out']);
                    if (checkIn && checkOut) {
                        const diffTime = checkOut.getTime() - checkIn.getTime();
                        numNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                    
                    cellContent += '<div class="booking-info">';
                    
                    if (booking['Customer']) {
                        cellContent += `<div class="customer-name">👤 ${escapeHtml(String(booking['Customer']))}`;
                        
                        // Show badge with house count and nights (always show)
                        const houseCount = housesBooked.length;
                        const houseText = houseCount === 1 ? '1 หลัง' : `${houseCount} หลัง`;
                        const nightText = numNights > 0 ? ` • ${numNights} คืน` : '';
                        cellContent += ` <span style="background: #fbbf24; color: #78350f; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 700; margin-left: 3px;">${houseText}${nightText}</span>`;
                        
                        cellContent += `</div>`;
                        
                        // Show list of houses if more than 1
                        if (housesBooked.length > 1) {
                            cellContent += `<div style="font-size: 9px; color: #059669; margin-top: 2px; font-weight: 500;">🏠 ${housesBooked.join(', ')}</div>`;
                        }
                    }
                    
                    if (booking['Phone_no']) {
                        cellContent += `<div class="phone">📱 ${escapeHtml(String(booking['Phone_no']))}</div>`;
                    }
                    if (booking['Total_Price']) {
                        cellContent += `<div class="price">💰 ${escapeHtml(String(booking['Total_Price']))} บาท</div>`;
                    }
                    if (booking['overdue']) {
                        cellContent += `<div class="overdue">⚠️ ค้าง: ${escapeHtml(String(booking['overdue']))} บาท</div>`;
                    }
                    if (booking['Other']) {
                        cellContent += `<div class="other">📝 ${escapeHtml(String(booking['Other']))}</div>`;
                    }
                    cellContent += '</div>';
                });
                
                row += `<td class="booking-cell">${cellContent}</td>`;
            } else {
                row += '<td class="empty-cell">-</td>';
            }
        });
        
        row += '</tr>';
        rows.push(row);
    });
    
    const html = `
        <div class="table-wrapper">
            <table>
                <thead>${headerRow}</thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    `;
    
    console.log(`✅ Table built: ${pageDates.length} rows, ${HOUSE_NAMES.length} houses`);
    
    return html;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update pagination UI
function updatePaginationUI() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    
    // Check if elements exist
    if (!prevBtn || !nextBtn || !pageInfo) {
        console.warn('⚠️ Pagination elements not found');
        return;
    }
    
    // Update page info
    pageInfo.textContent = `หน้า ${currentPage}/${totalPages}`;
    
    // Update button states
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    
    // Show/hide pagination based on total pages
    const paginationContainer = prevBtn.parentElement;
    if (paginationContainer && totalPages <= 1) {
        paginationContainer.style.display = 'none';
    } else if (paginationContainer) {
        paginationContainer.style.display = 'flex';
    }
}

// Load and display data
async function loadData() {
    const contentDiv = document.getElementById('calendar');
    const lastUpdateDiv = document.getElementById('lastUpdate');
    
    if (!contentDiv) {
        console.error('❌ Element #calendar not found!');
        return;
    }
    
    try {
        contentDiv.innerHTML = '<div class="loading"><div>กำลังโหลดข้อมูล...</div></div>';
        
        console.log('Starting to load data...');
        const sheetData = await fetchSheetData();
        console.log('Data loaded, building table...');
        
        // Show progress
        contentDiv.innerHTML = '<div class="loading"><div>กำลังสร้างตาราง...</div></div>';
        
        // Use setTimeout to prevent blocking
        setTimeout(() => {
            try {
                // Build table with data array directly (will be cached inside buildBookingTable)
                const dataArray = sheetData.data.map(row => {
                    const obj = {};
                    Object.keys(row).forEach(key => {
                        obj[key] = row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
                    });
                    return obj;
                });
                
                const tableHTML = buildBookingTable({ data: dataArray }, 1);
                
                contentDiv.innerHTML = tableHTML;
                
                if (lastUpdateDiv) {
                    const now = new Date();
                    lastUpdateDiv.innerHTML = `✅ อัพเดทล่าสุด: ${now.toLocaleTimeString('th-TH')}`;
                }
                
                console.log('✅ Table rendered successfully!');
            } catch (renderError) {
                console.error('❌ Error rendering table:', renderError);
                throw new Error(`ไม่สามารถแสดงตารางได้: ${renderError.message}`);
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Error in loadData:', error);
        
        let errorMessage = error.message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ';
        let suggestions = '';
        
        // Check if it's a CORS or fetch error
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            suggestions = `
                <div style="margin-top: 10px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <strong style="color: #d97706;">⚡ วิธีแก้แบบถาวร - ใช้ Google Apps Script</strong><br><br>
                    <p style="margin: 10px 0; line-height: 1.6;">
                        ปัญหา "Failed to fetch" เกิดจาก <strong>CORS policy</strong> ของเบราว์เซอร์<br>
                        แก้ได้โดยใช้ <strong>Google Apps Script</strong> แทนการเชื่อมต่อโดยตรง
                    </p>
                    <strong>📋 ทำตามขั้นตอนนี้ (5-10 นาที):</strong>
                    <ol style="margin: 10px 0 10px 20px; line-height: 1.8;">
                        <li>เปิด Google Sheet</li>
                        <li>Extensions → Apps Script</li>
                        <li>วาง code จากไฟล์ GoogleAppsScript.js</li>
                        <li>Deploy → New deployment → Web app</li>
                        <li>ตั้งค่า: Execute as "Me", Who has access "Anyone"</li>
                        <li>Copy Web app URL ที่ได้</li>
                        <li>แก้ไข app.js ใส่ URL</li>
                    </ol>
                    <div style="margin-top: 10px;">
                        <a href="SETUP_APPS_SCRIPT.md" target="_blank" style="display: inline-block; background: #d97706; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                            📖 ดูคู่มือแบบละเอียด
                        </a>
                    </div>
                </div>
                <p style="margin-top: 15px; font-size: 13px; color: #666;">
                    <strong>หรือลองวิธีชั่วคราว:</strong><br>
                    1. ตรวจสอบว่า Google Sheet เป็น <strong>Public</strong> (Share → Anyone with the link → Viewer)<br>
                    2. ลอง Refresh หน้าเว็บ<br>
                    3. ลอง Clear Cache แล้ว Refresh อีกครั้ง<br>
                    4. ลองใช้ Browser อื่น<br>
                    <br>
                    ⚠️ <em>แต่การใช้ Google Apps Script จะแก้ปัญหาได้ถาวรและไม่มีปัญหาอีก</em>
                </p>
            `;
        } else if (error.message.includes('HTTP Error')) {
            suggestions = `
                <p style="margin-top: 10px; font-size: 13px;">
                    <strong>วิธีแก้ไข:</strong><br>
                    1. ตรวจสอบว่า Google Sheet เป็น <strong>Public</strong><br>
                    2. ไปที่ Google Sheet → คลิก <strong>Share</strong><br>
                    3. เลือก <strong>"Anyone with the link"</strong> → <strong>Viewer</strong><br>
                    4. คลิก <strong>Done</strong> แล้วลอง Refresh อีกครั้ง
                </p>
            `;
        } else if (error.message.includes('ไม่มีข้อมูล')) {
            suggestions = `
                <p style="margin-top: 10px; font-size: 13px;">
                    <strong>วิธีแก้ไข:</strong><br>
                    1. ตรวจสอบชื่อ Sheet ต้องเป็น <strong>"booking"</strong><br>
                    2. ตรวจสอบว่ามีข้อมูลใน Sheet<br>
                    3. ตรวจสอบว่า Sheet ID ถูกต้อง
                </p>
            `;
        } else if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
            suggestions = `
                <p style="margin-top: 10px; font-size: 13px;">
                    <strong>วิธีแก้ไข:</strong><br>
                    1. ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต<br>
                    2. ตรวจสอบว่า Google Sheet เป็น <strong>Public</strong><br>
                    3. ลอง Clear Cache แล้ว Refresh อีกครั้ง<br>
                    4. ตรวจสอบว่า URL ของ Google Sheet ถูกต้อง
                </p>
            `;
        } else {
            suggestions = `
                <p style="margin-top: 10px; font-size: 13px;">
                    <strong>ขั้นตอนการตรวจสอบ:</strong><br>
                    1. เปิด Console (กด F12) เพื่อดู error ละเอียด<br>
                    2. ตรวจสอบว่า Google Sheet เป็น Public<br>
                    3. ตรวจสอบชื่อ Sheet เป็น "booking"<br>
                    4. ตรวจสอบว่ามีคอลัมน์ที่จำเป็นครบถ้วน
                </p>
            `;
        }
        
        contentDiv.innerHTML = `
            <div class="error">
                <h3>❌ เกิดข้อผิดพลาด</h3>
                <p style="margin-top: 8px; font-weight: 600;">${errorMessage}</p>
                ${suggestions}
                <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
                    <strong>🔗 Google Sheet URL:</strong><br>
                    <code style="font-size: 11px; word-break: break-all;">
                        https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit
                    </code>
                </div>
                <div style="margin-top: 10px;">
                    <button onclick="loadData()" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        🔄 ลองอีกครั้ง
                    </button>
                </div>
            </div>
        `;
        lastUpdateDiv.innerHTML = '❌ โหลดข้อมูลล้มเหลว';
    }
}

// Populate month filter dropdown
function populateMonthFilter(dates) {
    const monthSelect = document.getElementById('monthFilter');
    const today = new Date();
    const currentMonthKey = `${today.getFullYear() + 543}-${today.getMonth()}`;
    
    // Get unique months from dates
    const monthsMap = new Map();
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 
                        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    
    dates.forEach(date => {
        const month = date.getMonth();
        const year = date.getFullYear() + 543; // Convert to BE
        const key = `${year}-${month}`;
        const label = `${thaiMonths[month]} ${year}`;
        
        if (!monthsMap.has(key)) {
            monthsMap.set(key, { month, year, label, date: new Date(date) });
        }
    });
    
    // Sort by date
    const months = Array.from(monthsMap.values()).sort((a, b) => a.date - b.date);
    
    // Clear and rebuild options
    monthSelect.innerHTML = '<option value="all">ทุกเดือน</option>';
    
    months.forEach(m => {
        const option = document.createElement('option');
        option.value = `${m.year}-${m.month}`;
        option.textContent = m.label;
        monthSelect.appendChild(option);
    });
    
    // Set default to current month if available, or use previous selection
    if (selectedMonth === null) {
        const exists = Array.from(monthSelect.options).some(opt => opt.value === currentMonthKey);
        if (exists) {
            selectedMonth = currentMonthKey;
            monthSelect.value = currentMonthKey;
            console.log(`📅 Default month set to current month: ${currentMonthKey}`);
        } else {
            selectedMonth = 'all';
        }
    } else if (selectedMonth && selectedMonth !== 'all') {
        // Restore previous selection if still exists
        const exists = Array.from(monthSelect.options).some(opt => opt.value === selectedMonth);
        if (exists) {
            monthSelect.value = selectedMonth;
        } else {
            selectedMonth = 'all';
        }
    }
}

// Event listeners

// Month filter
document.getElementById('monthFilter').addEventListener('change', (e) => {
    selectedMonth = e.target.value;
    console.log(`📆 Month filter changed to: ${selectedMonth}`);
    
    if (cachedBookings) {
        renderCachedData(1);
    }
});

// Pagination buttons
document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) {
        renderCachedData(currentPage - 1);
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentPage < totalPages) {
        renderCachedData(currentPage + 1);
    }
});

// Render from cached data
function renderCachedData(page) {
    if (!cachedBookings) return;
    
    const contentDiv = document.getElementById('calendar');
    if (!contentDiv) {
        console.error('❌ Element #calendar not found in renderCachedData!');
        return;
    }
    
    contentDiv.innerHTML = '<div class="loading"><div>📊 กำลังสร้างตาราง...</div></div>';
    
    setTimeout(() => {
        const tableHTML = buildBookingTable({ data: cachedBookings.map(b => ({...b})) }, page);
        contentDiv.innerHTML = tableHTML;
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
}

// Initial load
loadData();

// Auto refresh every 5 minutes
setInterval(loadData, 5 * 60 * 1000);

// ========== CHARTS FUNCTIONALITY ==========

// Chart instances
// Global chart instances
window.monthlyRevenueChart = null;
window.yearlyRevenueChart = null;
window.bookingCountChart = null;

// Fetch revenue data
async function fetchRevenueData() {
    console.log('📊 Fetching revenue data...');
    try {
        const url = `${WEB_APP_URL}?action=revenue`;
        console.log('📍 Revenue API URL:', url);
        
        const response = await fetch(url);
        console.log('📡 Revenue API Status:', response.status);
        
        const result = await response.json();
        console.log('📦 Revenue API Result:', result);
        
        if (!result.success) {
            console.error('❌ Error fetching revenue data:', result.error);
            return null;
        }
        
        console.log(`✅ Revenue data loaded: ${result.data.length} rows`);
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching revenue data:', error);
        return null;
    }
}

// Fetch booking count data
async function fetchBookingCountData() {
    console.log('🏠 Fetching booking count data...');
    try {
        const url = `${WEB_APP_URL}?action=bookingcount`;
        console.log('📍 Booking Count API URL:', url);
        
        const response = await fetch(url);
        console.log('📡 Booking Count API Status:', response.status);
        
        const result = await response.json();
        console.log('📦 Booking Count API Result:', result);
        
        if (!result.success) {
            console.error('❌ Error fetching booking count data:', result.error);
            return null;
        }
        
        console.log(`✅ Booking count data loaded: ${result.data.length} rows`);
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching booking count data:', error);
        return null;
    }
}

// สร้าง Chart 1: รายได้รายเดือนปีปัจจุบัน
function createMonthlyRevenueChart(data) {
    const ctx = document.getElementById('monthlyRevenueChart');
    if (!ctx) return;
    
    // ถ้ามี chart อยู่แล้ว ให้ destroy ก่อน
    if (window.monthlyRevenueChart) {
        window.monthlyRevenueChart.destroy();
    }
    
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 
                       'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    
    // หาปีล่าสุดที่มีข้อมูล (รวม > 0)
    let latestYear = 0;
    let latestYearData = null;
    const yearsWithData = []; // ปีที่มีข้อมูลจริง
    
    data.forEach(row => {
        // Extract ตัวเลขจากคอลัมน์ "ปี" ที่อาจเป็น "ปี 2568" หรือ 2568
        // รองรับทั้ง 'ปี', 'year', ' year' (มี space), 'Year'
        let yearValue = row['ปี'] || row['year'] || row[' year'] || row['Year'];
        let year = 0;
        
        if (yearValue) {
            // ถ้าเป็น string ที่มีคำว่า "ปี" หรือมีตัวเลข ให้ extract ตัวเลขออกมา
            if (typeof yearValue === 'string') {
                const match = yearValue.match(/\d{4}/); // หาตัวเลข 4 หลัก
                if (match) {
                    year = parseInt(match[0]);
                }
            } else {
                year = parseInt(yearValue);
            }
        }
        
        if (year > 0) {
            // ตรวจสอบว่ามีข้อมูล (รวม > 0)
            const total = parseFloat(row['รวม'] || row['total'] || row['Total'] || 0);
            if (total > 0) {
                yearsWithData.push({year: year, total: total, data: row});
            }
        }
        
        if (year > latestYear) {
            latestYear = year;
            latestYearData = row;
        }
    });
    
    // ใช้ปีที่มีข้อมูลล่าสุดแทน (รวม > 0)
    if (yearsWithData.length > 0) {
        // เรียงจากมากไปน้อย
        yearsWithData.sort((a, b) => b.year - a.year);
        latestYear = yearsWithData[0].year;
        latestYearData = yearsWithData[0].data;
        console.log(`ใช้ปีที่มีข้อมูล: ${latestYear} (รวม: ${yearsWithData[0].total.toLocaleString()} บาท)`);
    }
    
    // สร้างข้อมูลรายเดือน (12 เดือน)
    let monthlyData = new Array(12).fill(0);
    
    if (latestYearData) {
        monthlyData = [
            parseFloat(latestYearData['ม.ค.'] || 0),
            parseFloat(latestYearData['ก.พ.'] || 0),
            parseFloat(latestYearData['มี.ค.'] || 0),
            parseFloat(latestYearData['เม.ย.'] || 0),
            parseFloat(latestYearData['พ.ค.'] || 0),
            parseFloat(latestYearData['มิ.ย.'] || 0),
            parseFloat(latestYearData['ก.ค.'] || 0),
            parseFloat(latestYearData['ส.ค.'] || 0),
            parseFloat(latestYearData['ก.ย.'] || 0),
            parseFloat(latestYearData['ต.ค.'] || 0),
            parseFloat(latestYearData['พ.ย.'] || 0),
            parseFloat(latestYearData['ธ.ค.'] || 0)
        ];
    }
    
    window.monthlyRevenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthNames,
            datasets: [{
                label: `รายได้ปี ${latestYear}`,
                data: monthlyData,
                backgroundColor: 'rgba(255, 179, 0, 0.7)',
                borderColor: 'rgba(255, 161, 0, 1)',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 14, weight: 'bold' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `รายได้: ${context.parsed.y.toLocaleString()} บาท`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: true,      // เปิด auto skip
                        maxRotation: 45,     // หมุนได้สูงสุด 45 องศา
                        minRotation: 0,      // ไม่หมุนถ้าพอ
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString() + ' บาท';
                        }
                    }
                }
            }
        }
    });
}

// สร้าง Chart 2: เปรียบเทียบรายได้รายปี
function createYearlyRevenueChart(data) {
    const ctx = document.getElementById('yearlyRevenueChart');
    if (!ctx) return;
    
    if (window.yearlyRevenueChart) {
        window.yearlyRevenueChart.destroy();
    }
    
    // ดึงรายได้แต่ละปีจากคอลัมน์ "รวม"
    const years = [];
    const revenues = [];
    
    data.forEach(row => {
        // Extract ตัวเลขจากคอลัมน์ "ปี" - รองรับทั้ง 'ปี', 'year', ' year' (มี space), 'Year'
        let yearValue = row['ปี'] || row['year'] || row[' year'] || row['Year'];
        let year = null;
        
        if (yearValue) {
            if (typeof yearValue === 'string') {
                const match = yearValue.match(/\d{4}/); // หาตัวเลข 4 หลัก
                if (match) {
                    year = parseInt(match[0]);
                }
            } else {
                year = parseInt(yearValue);
            }
        }
        
        const total = parseFloat(row['รวม'] || row['total'] || row['Total'] || 0);
        
        if (year && total > 0) {
            years.push(year);
            revenues.push(total);
        }
    });
    
    window.yearlyRevenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'รายได้รายปี',
                data: revenues,
                backgroundColor: 'rgba(30, 61, 51, 0.2)',
                borderColor: 'rgba(30, 61, 51, 1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(30, 61, 51, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 14, weight: 'bold' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `รายได้: ${context.parsed.y.toLocaleString()} บาท`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: true,      // เปิด auto skip
                        maxRotation: 0,      // ไม่หมุน (เพราะเป็นปี จำนวนน้อย)
                        minRotation: 0,
                        font: {
                            size: 12
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString() + ' บาท';
                        }
                    }
                }
            }
        }
    });
}

// สร้าง Chart 3: จำนวนการจองแยกรายบ้าน
function createBookingCountChart(data) {
    const ctx = document.getElementById('bookingCountChart');
    if (!ctx) return;
    
    if (window.bookingCountChart) {
        window.bookingCountChart.destroy();
    }
    
    // ชื่อบ้านทั้งหมด (15 หลัง)
    const houseNames = [
        'ฮอมฮัก', 'ซอมนา', 'อุ่นละมุน', 'เพียงตะวัน', 'อินทอง',
        'ผาหมวกผาหนอง', 'ภูสอยดาว', 'ภูไก่ห้อย', 'ภูหัวฮ่อม', 'ภูสวนทราย',
        'ภูเก้าง้อม', 'ศรีเพชร', 'ธารสวรรค์', 'นาHugหลาย', 'เคียงดาว'
    ];
    
    // รวมจำนวนการจองแต่ละบ้าน (รวมทุกแถว)
    const bookingCounts = houseNames.map(house => {
        let total = 0;
        data.forEach(row => {
            const count = parseInt(row[house] || 0);
            total += count;
        });
        return total;
    });
    
    // สร้างสีที่หลากหลาย
    const colors = [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)',
        'rgba(83, 102, 255, 0.7)',
        'rgba(255, 99, 255, 0.7)',
        'rgba(99, 255, 132, 0.7)',
        'rgba(255, 206, 132, 0.7)',
        'rgba(132, 206, 255, 0.7)',
        'rgba(206, 132, 255, 0.7)',
        'rgba(132, 255, 206, 0.7)',
        'rgba(255, 132, 206, 0.7)'
    ];
    
    window.bookingCountChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: houseNames,
            datasets: [{
                label: 'จำนวนการจอง',
                data: bookingCounts,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.7', '1')),
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // แนวนอน
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `จำนวนการจอง: ${context.parsed.x} ครั้ง`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                },
                y: {
                    ticks: {
                        autoSkip: false,  // ห้าม skip labels - แสดงชื่อบ้านครบทุกหลัง
                        maxRotation: 0,   // ไม่หมุน
                        minRotation: 0,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12  // เล็กลงบนมือถือ/iPad
                        }
                    }
                }
            }
        }
    });
}

// โหลดและสร้าง charts ทั้งหมด
async function loadCharts() {
    console.log('Loading charts...');
    
    // Show loading state WITHOUT destroying canvas
    const chartWrappers = document.querySelectorAll('.chart-wrapper');
    chartWrappers.forEach(wrapper => {
        // เก็บ canvas ID ไว้
        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
            const canvasId = canvas.id;
            wrapper.innerHTML = '<div class="chart-loading">⏳ กำลังโหลดข้อมูล...</div>';
            wrapper.dataset.canvasId = canvasId; // เก็บ ID ไว้
        }
    });
    
    try {
        // Load revenue data สำหรับ Chart 1 และ 2
        console.log('📊 Fetching revenue data...');
        const revenueData = await fetchRevenueData();
        
        if (revenueData && revenueData.length > 0) {
            console.log(`✅ Creating Chart 1 and 2 with ${revenueData.length} rows...`);
            
            // Restore canvas for Chart 1
            const wrapper1 = document.querySelectorAll('.chart-wrapper')[0];
            if (wrapper1) {
                wrapper1.innerHTML = '<canvas id="monthlyRevenueChart"></canvas>';
                console.log('📊 Creating monthly revenue chart...');
                createMonthlyRevenueChart(revenueData);
                console.log('✅ Monthly revenue chart created!');
            }
            
            // Restore canvas for Chart 2
            const wrapper2 = document.querySelectorAll('.chart-wrapper')[1];
            if (wrapper2) {
                wrapper2.innerHTML = '<canvas id="yearlyRevenueChart"></canvas>';
                console.log('📊 Creating yearly revenue chart...');
                createYearlyRevenueChart(revenueData);
                console.log('✅ Yearly revenue chart created!');
            }
        } else {
            console.warn('⚠️ No revenue data available');
            const wrapper1 = document.querySelectorAll('.chart-wrapper')[0];
            const wrapper2 = document.querySelectorAll('.chart-wrapper')[1];
            if (wrapper1) wrapper1.innerHTML = '<div class="chart-error">⚠️ ไม่พบข้อมูลรายได้</div>';
            if (wrapper2) wrapper2.innerHTML = '<div class="chart-error">⚠️ ไม่พบข้อมูลรายได้</div>';
        }
        
        // Load booking count data สำหรับ Chart 3
        console.log('🏠 Fetching booking count data...');
        const bookingCountData = await fetchBookingCountData();
        
        if (bookingCountData && bookingCountData.length > 0) {
            console.log(`✅ Creating Chart 3 with ${bookingCountData.length} rows...`);
            
            // Restore canvas for Chart 3
            const wrapper3 = document.querySelectorAll('.chart-wrapper')[2];
            if (wrapper3) {
                wrapper3.innerHTML = '<canvas id="bookingCountChart"></canvas>';
                console.log('📊 Creating booking count chart...');
                createBookingCountChart(bookingCountData);
                console.log('✅ Booking count chart created!');
            }
        } else {
            console.warn('⚠️ No booking count data available');
            const wrapper3 = document.querySelectorAll('.chart-wrapper')[2];
            if (wrapper3) wrapper3.innerHTML = '<div class="chart-error">⚠️ ไม่พบข้อมูลจำนวนการจอง</div>';
        }
        
        // Populate year dropdown และ Load Chart 4
        console.log('📅 Setting up year filter for Chart 4...');
        const yearFilter = document.getElementById('yearFilterChart');
        if (yearFilter) {
            // สร้างรายการปี (2565-2575)
            const currentYear = new Date().getFullYear() + 543; // ปีปัจจุบัน พ.ศ.
            const years = [];
            for (let y = 2565; y <= 2575; y++) {
                years.push(y);
            }
            
            // เติม options
            yearFilter.innerHTML = '';
            years.forEach(y => {
                const option = document.createElement('option');
                option.value = y;
                option.textContent = `ปี ${y}`;
                if (y === currentYear) {
                    option.selected = true;
                }
                yearFilter.appendChild(option);
            });
            
            // โหลด Chart 4 ครั้งแรก
            await loadBookingCountByYearChart(yearFilter.value);
            
            // Event listener สำหรับเปลี่ยนปี
            yearFilter.addEventListener('change', async function() {
                console.log('📅 Year changed to:', this.value);
                await loadBookingCountByYearChart(this.value);
            });
            
            console.log('✅ Year filter setup complete!');
        } else {
            console.warn('⚠️ Year filter dropdown not found');
        }
        
        // Populate year dropdown และ Load Chart 5
        console.log('💰 Setting up year filter for Chart 5...');
        const yearFilterRevenue = document.getElementById('yearFilterRevenue');
        if (yearFilterRevenue) {
            // สร้างรายการปี (2565-2575)
            const currentYear = new Date().getFullYear() + 543;
            const years = [];
            for (let y = 2565; y <= 2575; y++) {
                years.push(y);
            }
            
            // เติม options
            yearFilterRevenue.innerHTML = '';
            years.forEach(y => {
                const option = document.createElement('option');
                option.value = y;
                option.textContent = `ปี ${y}`;
                if (y === currentYear) {
                    option.selected = true;
                }
                yearFilterRevenue.appendChild(option);
            });
            
            // โหลด Chart 5 ครั้งแรก
            await loadRevenueByYearChart(yearFilterRevenue.value);
            
            // Event listener สำหรับเปลี่ยนปี
            yearFilterRevenue.addEventListener('change', async function() {
                console.log('💰 Revenue year changed to:', this.value);
                await loadRevenueByYearChart(this.value);
            });
            
            console.log('✅ Revenue year filter setup complete!');
        } else {
            console.warn('⚠️ Revenue year filter dropdown not found');
        }
        
        console.log('✅✅✅ ALL CHARTS LOADED SUCCESSFULLY! ✅✅✅');
    } catch (error) {
        console.error('❌ Error loading charts:', error);
        console.error('❌ Error stack:', error.stack);
        
        // Show error message
        chartWrappers.forEach(wrapper => {
            wrapper.innerHTML = '<div class="chart-error">❌ เกิดข้อผิดพลาดในการโหลดกราฟ: ' + error.message + '</div>';
        });
    }
}

// ========================================
// Chart 4: จำนวนการจองแยกรายบ้านตามปี
// ========================================

// ดึงข้อมูลจำนวนการจองตามปี
async function fetchBookingCountByYear(year) {
    console.log(`📅 Fetching booking count for year ${year}...`);
    try {
        const url = `${WEB_APP_URL}?action=bookingyear&year=${year}`;
        console.log('📍 Booking Count by Year API URL:', url);
        
        const response = await fetch(url);
        console.log('📡 Booking Count by Year API Status:', response.status);
        
        const result = await response.json();
        console.log('📦 Booking Count by Year API Result:', result);
        
        if (!result.success) {
            console.error('❌ Error fetching booking count by year:', result.error);
            return null;
        }
        
        console.log(`✅ Booking count by year loaded: ${result.data.length} rows`);
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching booking count by year:', error);
        return null;
    }
}

// สร้าง Chart 4
function createBookingCountByYearChart(data, year) {
    console.log('📊 Creating booking count by year chart for year:', year);
    
    if (!data || data.length === 0) {
        console.error('❌ No data for booking count by year chart');
        return;
    }
    
    const row = data[0];
    const labels = [];
    const values = [];
    const colors = [
        '#3498db', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c',
        '#34495e', '#e67e22', '#95a5a6', '#16a085', '#27ae60',
        '#2980b9', '#8e44ad', '#c0392b', '#d35400', '#7f8c8d'
    ];
    
    for (let key in row) {
        labels.push(key);
        values.push(row[key] || 0);
    }
    
    const ctx = document.getElementById('bookingCountByYearChart');
    if (!ctx) {
        console.error('❌ Canvas bookingCountByYearChart not found');
        return;
    }
    
    // ทำลาย chart เก่าถ้ามี
    if (window.bookingCountByYearChartInstance) {
        window.bookingCountByYearChartInstance.destroy();
    }
    
    window.bookingCountByYearChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `จำนวนการจอง (ปี ${year})`,
                data: values,
                backgroundColor: colors,
                borderColor: colors.map(c => c),
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `จำนวนการจองแต่ละบ้านในปี ${year}`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                },
                y: {
                    ticks: {
                        autoSkip: false,  // ห้าม skip labels - แสดงชื่อบ้านครบทุกหลัง
                        maxRotation: 0,   // ไม่หมุน
                        minRotation: 0,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12  // เล็กลงบนมือถือ/iPad
                        }
                    }
                }
            }
        }
    });
    
    console.log('✅ Booking count by year chart created!');
}

// โหลด Chart 4 ตามปีที่เลือก
async function loadBookingCountByYearChart(year) {
    console.log(`🔄 Loading booking count by year chart for year ${year}...`);
    
    const wrapper = document.querySelectorAll('.chart-wrapper')[3]; // Chart 4
    if (!wrapper) {
        console.error('❌ Chart 4 wrapper not found');
        return;
    }
    
    // แสดง loading
    wrapper.innerHTML = '<div class="chart-loading">⏳ กำลังโหลดข้อมูล...</div>';
    
    // ดึงข้อมูล
    const data = await fetchBookingCountByYear(year);
    
    if (data && data.length > 0) {
        // Restore canvas
        wrapper.innerHTML = '<canvas id="bookingCountByYearChart"></canvas>';
        createBookingCountByYearChart(data, year);
    } else {
        wrapper.innerHTML = '<div class="chart-error">⚠️ ไม่พบข้อมูลการจองในปีนี้</div>';
    }
}

// ========================================
// Chart 5: รายได้แต่ละบ้านตามปี
// ========================================

// ดึงข้อมูลรายได้แต่ละบ้านตามปี
async function fetchRevenueByYear(year) {
    console.log(`💰 Fetching revenue by year for ${year}...`);
    try {
        const url = `${WEB_APP_URL}?action=revenuebyyear&year=${year}`;
        console.log('📍 Revenue by Year API URL:', url);
        
        const response = await fetch(url);
        console.log('📡 Revenue by Year API Status:', response.status);
        
        const result = await response.json();
        console.log('📦 Revenue by Year API Result:', result);
        
        if (!result.success) {
            console.error('❌ Error fetching revenue by year:', result.error);
            return null;
        }
        
        console.log(`✅ Revenue by year loaded: ${result.data.length} rows`);
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching revenue by year:', error);
        return null;
    }
}

// สร้าง Chart 5
function createRevenueByYearChart(data, year) {
    console.log('📊 Creating revenue by year chart for year:', year);
    
    if (!data || data.length === 0) {
        console.error('❌ No data for revenue by year chart');
        return;
    }
    
    const row = data[0];
    const labels = [];
    const values = [];
    const colors = [
        '#3498db', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c',
        '#34495e', '#e67e22', '#95a5a6', '#16a085', '#27ae60',
        '#2980b9', '#8e44ad', '#c0392b', '#d35400', '#7f8c8d'
    ];
    
    for (let key in row) {
        labels.push(key);
        values.push(row[key] || 0);
    }
    
    const ctx = document.getElementById('revenueByYearChart');
    if (!ctx) {
        console.error('❌ Canvas revenueByYearChart not found');
        return;
    }
    
    // ทำลาย chart เก่าถ้ามี
    if (window.revenueByYearChartInstance) {
        window.revenueByYearChartInstance.destroy();
    }
    
    window.revenueByYearChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `รายได้ (ปี ${year})`,
                data: values,
                backgroundColor: colors,
                borderColor: colors.map(c => c),
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `รายได้แต่ละบ้านในปี ${year}`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.x;
                            return `รายได้: ${value.toLocaleString('th-TH')} บาท`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('th-TH');
                        }
                    }
                },
                y: {
                    ticks: {
                        autoSkip: false,  // แสดงชื่อบ้านครบ
                        maxRotation: 0,
                        minRotation: 0,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                }
            }
        }
    });
    
    console.log('✅ Revenue by year chart created!');
}

// โหลด Chart 5 ตามปีที่เลือก
async function loadRevenueByYearChart(year) {
    console.log(`🔄 Loading revenue by year chart for year ${year}...`);
    
    const wrapper = document.querySelectorAll('.chart-wrapper')[4]; // Chart 5
    if (!wrapper) {
        console.error('❌ Chart 5 wrapper not found');
        return;
    }
    
    // แสดง loading
    wrapper.innerHTML = '<div class="chart-loading">⏳ กำลังโหลดข้อมูล...</div>';
    
    // ดึงข้อมูล
    const data = await fetchRevenueByYear(year);
    
    if (data && data.length > 0) {
        // Restore canvas
        wrapper.innerHTML = '<canvas id="revenueByYearChart"></canvas>';
        createRevenueByYearChart(data, year);
    } else {
        wrapper.innerHTML = '<div class="chart-error">⚠️ ไม่พบข้อมูลรายได้ในปีนี้</div>';
    }
}

// โหลด charts หลังจากโหลดตารางเสร็จ
setTimeout(() => {
    loadCharts();
}, 2000);

// Refresh charts ทุก 10 นาที
setInterval(loadCharts, 10 * 60 * 1000);

// ========================================
// แก้ปัญหาหมุนหน้าจอ - ตารางเล็กลง
// ========================================

// Function สำหรับ recalculate layout
function recalculateLayout() {
    console.log('🔄 Recalculating layout...');
    
    // Force reflow
    const container = document.querySelector('.container');
    const tableWrapper = document.querySelector('.table-wrapper');
    
    if (container) {
        // Trigger reflow โดยการอ่าน offsetHeight
        const height = container.offsetHeight;
        console.log('Container height:', height);
    }
    
    if (tableWrapper) {
        // Reset scroll position
        tableWrapper.scrollLeft = 0;
        
        // Trigger reflow
        const width = tableWrapper.offsetWidth;
        console.log('Table wrapper width:', width);
        
        // Force repaint
        tableWrapper.style.display = 'none';
        tableWrapper.offsetHeight; // Trigger reflow
        tableWrapper.style.display = 'block';
    }
    
    // ========================================
    // แก้ปัญหา Charts ยืดแล้วไม่ย่อกลับ
    // ========================================
    console.log('📊 Resizing all charts...');
    
    // รายการ chart instances ทั้งหมด
    const chartInstances = [
        { name: 'Monthly Revenue', instance: window.monthlyRevenueChart },
        { name: 'Yearly Revenue', instance: window.yearlyRevenueChart },
        { name: 'Booking Count', instance: window.bookingCountChart },
        { name: 'Booking by Year', instance: window.bookingCountByYearChartInstance },
        { name: 'Revenue by Year', instance: window.revenueByYearChartInstance }
    ];
    
    let resizedCount = 0;
    
    chartInstances.forEach(chart => {
        if (chart.instance) {
            try {
                // CRITICAL: ต้องเรียกทั้ง resize() และ update()
                // - resize() = resize canvas
                // - update() = recalculate ticks, labels, autoSkip
                
                chart.instance.resize();
                chart.instance.update('none'); // 'none' = no animation
                
                console.log(`✅ Resized & Updated: ${chart.name}`);
                resizedCount++;
            } catch (error) {
                console.error(`❌ Failed to resize/update ${chart.name}:`, error);
            }
        } else {
            console.log(`⚠️ ${chart.name} instance not found`);
        }
    });
    
    console.log(`✅ Layout recalculated. Charts resized: ${resizedCount}/5`);
}

// Event listener สำหรับ resize
let resizeTimeout;
window.addEventListener('resize', () => {
    console.log('📱 Window resized');
    
    // Debounce - รอ 300ms หลังจากหยุด resize
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        recalculateLayout();
    }, 300);
});

// Event listener สำหรับ orientation change
window.addEventListener('orientationchange', () => {
    console.log('🔄 Orientation changed');
    
    // รอ animation เสร็จ (500ms) แล้วค่อย recalculate
    setTimeout(() => {
        recalculateLayout();
    }, 500);
});

// Event listener สำหรับ viewport size change (iOS Safari)
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        console.log('📱 Visual viewport resized');
        
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            recalculateLayout();
        }, 300);
    });
}

console.log('✅ Layout event listeners initialized');
