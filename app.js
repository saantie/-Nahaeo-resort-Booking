// Configuration
const SHEET_ID = '1IshovQni9Eiq9IeRdDg_2cXTSSkC7YIK2fbDTm_dcs0';
const SHEET_NAME = 'booking';
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx5iJLg00GdREQKSk9FpxBeqz6dyiTOgLLBK36_YuAhKEZsQDXGosVLMeR_RyULABvOlg/exec';

// ✅ Google Apps Script Web App URL ได้ถูกตั้งค่าแล้ว
// เว็บจะใช้วิธีนี้ในการดึงข้อมูล (แก้ปัญหา CORS แล้ว)

// House names mapping
const HOUSE_NAMES = [
    'ซอมนา', 'ฮอมฮัก', 'อุ่นละมุน', 'เพียงตะวัน', 'ผาหมวกผาหนอง',
    'ภูสอยดาว', 'ภูไก่ห้อย', 'ภูหัวฮ่อม', 'ภูสวนทราย', 'ภูเก้าง้อม',
    'ศรีเพชร', 'อินทอง', 'ธารสวรรค์', 'นาHugหลาย', 'เคียงดาว'
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
let maxDaysToShow = 90;

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
    document.getElementById('installBanner').classList.add('show');
});

document.getElementById('installBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        document.getElementById('installBanner').classList.remove('show');
    }
});

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

// Format date to Thai format
function formatDateThai(date) {
    const days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 
                    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
}

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

// Check if date is in booking range
function isDateInBooking(date, checkIn, checkOut) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    const ci = parseDate(checkIn);
    const co = parseDate(checkOut);
    
    if (!ci || !co) {
        return false;
    }
    
    ci.setHours(0, 0, 0, 0);
    co.setHours(0, 0, 0, 0);
    
    return d >= ci && d < co;
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
        for (const col of SPLIT_COLUMNS) {
            if (row[col] && row[col] !== '' && row[col] !== 'undefined' && row[col] !== 'null') {
                return true;
            }
        }
        return false;
    });
    
    console.log('✅ Bookings with house info:', bookingsWithHouse.length);
    
    if (bookingsWithHouse.length === 0) {
        console.warn('⚠️ No bookings have house information in SPLIT_HBK columns!');
        console.log('Sample booking:', bookings[0]);
        
        return `
            <div class="warning">
                <h3>⚠️ ไม่พบข้อมูลบ้านพัก</h3>
                <p>พบข้อมูลการจอง ${bookings.length} แถว แต่ไม่มีข้อมูลในคอลัมน์ SPLIT_HBK1-15</p>
                <p style="margin-top: 10px; font-size: 13px;">
                    <strong>วิธีแก้:</strong><br>
                    1. เปิดหน้า <a href="debug-sheet-data.html" target="_blank">debug-sheet-data.html</a><br>
                    2. ดูว่าคอลัมน์ SPLIT_HBK1-15 มีข้อมูลหรือไม่<br>
                    3. คอลัมน์เหล่านี้ใช้ระบุว่าการจองนั้นจองบ้านไหน
                </p>
            </div>
        `;
    }
    
    // Sample SPLIT values for debugging
    console.log('Sample SPLIT values:');
    for (let i = 1; i <= 15; i++) {
        const col = `SPLIT_HBK${i}`;
        const sample = bookingsWithHouse.find(b => b[col]);
        if (sample) {
            console.log(`  ${col}: "${sample[col]}"`);
        }
    }
    
    // Cache bookings for pagination (use bookingsWithHouse instead of all bookings)
    cachedBookings = bookingsWithHouse.length > 0 ? bookingsWithHouse : bookings;
    
    // Get date range
    console.log('Getting date range...');
    let dates = getDateRange(bookingsWithHouse.length > 0 ? bookingsWithHouse : bookings);
    console.log('Total date range:', dates.length, 'days');
    
    // Apply max days limit
    if (maxDaysToShow !== 'all' && dates.length > maxDaysToShow) {
        console.log(`⚠️ Limiting display to ${maxDaysToShow} days`);
        dates = dates.slice(0, maxDaysToShow);
    }
    
    // Populate month filter dropdown
    populateMonthFilter(dates);
    
    // Apply month filter
    if (currentMonthFilter && currentMonthFilter !== 'all') {
        const [filterYear, filterMonth] = currentMonthFilter.split('-').map(Number);
        dates = dates.filter(date => {
            const dateMonth = date.getMonth();
            const dateYear = date.getFullYear() + 543; // Convert to BE
            return dateMonth === filterMonth && dateYear === filterYear;
        });
        console.log(`📆 Filtered to month ${currentMonthFilter}: ${dates.length} days`);
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
        let row = '<tr>';
        row += `<td class="date-cell ${isToday ? 'today-row' : ''}">${formatDateThai(date)}</td>`;
        
        // Check each house for bookings on this date
        SPLIT_COLUMNS.forEach((splitCol, houseIdx) => {
            const cellBookings = [];
            
            bookingsWithHouse.forEach(booking => {
                const hasHouse = booking[splitCol] && booking[splitCol] !== '' && booking[splitCol] !== 'undefined' && booking[splitCol] !== 'null';
                
                if (hasHouse && isDateInBooking(date, booking['Date_ck_in'], booking['Date_ck_out'])) {
                    cellBookings.push(booking);
                    
                    // Debug first match
                    if (idx === 0 && houseIdx === 0 && cellBookings.length === 1) {
                        console.log(`✅ Found booking match:`, {
                            date: formatDateThai(date),
                            house: splitCol,
                            value: booking[splitCol],
                            checkIn: booking['Date_ck_in'],
                            checkOut: booking['Date_ck_out'],
                            customer: booking['Customer']
                        });
                    }
                }
            });
            
            if (cellBookings.length > 0) {
                let cellContent = '';
                
                // Group by customer to avoid showing duplicate info
                const uniqueBookings = new Map();
                
                cellBookings.forEach(booking => {
                    const key = `${booking['Customer']}_${booking['Phone_no']}_${booking['Date_ck_in']}_${booking['Date_ck_out']}`;
                    if (!uniqueBookings.has(key)) {
                        uniqueBookings.set(key, booking);
                    }
                });
                
                uniqueBookings.forEach((booking) => {
                    // Check how many houses this customer booked on this date range
                    const housesBooked = [];
                    SPLIT_COLUMNS.forEach((col, idx) => {
                        const hasHouse = booking[col] && booking[col] !== '' && booking[col] !== 'undefined' && booking[col] !== 'null';
                        if (hasHouse && isDateInBooking(date, booking['Date_ck_in'], booking['Date_ck_out'])) {
                            housesBooked.push(HOUSE_NAMES[idx]);
                        }
                    });
                    
                    cellContent += '<div class="booking-info">';
                    
                    if (booking['Customer']) {
                        cellContent += `<div class="customer-name">👤 ${escapeHtml(String(booking['Customer']))}`;
                        
                        // Show badge if booked multiple houses
                        if (housesBooked.length > 1) {
                            cellContent += ` <span style="background: #fbbf24; color: #78350f; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 4px;">จอง ${housesBooked.length} หลัง</span>`;
                        }
                        
                        cellContent += `</div>`;
                        
                        // Show list of houses if more than 1
                        if (housesBooked.length > 1) {
                            cellContent += `<div style="font-size: 11px; color: #059669; margin-top: 3px; font-weight: 500;">🏠 ${housesBooked.join(', ')}</div>`;
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
    const paginationInfo = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    
    if (totalPages > 1) {
        paginationInfo.style.display = 'flex';
        pageInfo.textContent = `หน้า ${currentPage}/${totalPages}`;
        
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    } else {
        paginationInfo.style.display = 'none';
    }
}

// Load and display data
async function loadData() {
    const contentDiv = document.getElementById('content');
    const lastUpdateDiv = document.getElementById('lastUpdate');
    
    try {
        contentDiv.innerHTML = '<div class="loading"><div>⏳ กำลังโหลดข้อมูล...</div></div>';
        
        console.log('Starting to load data...');
        const sheetData = await fetchSheetData();
        console.log('Data loaded, building table...');
        
        // Show progress
        contentDiv.innerHTML = '<div class="loading"><div>📊 กำลังสร้างตาราง...</div></div>';
        
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
                
                const now = new Date();
                lastUpdateDiv.innerHTML = `✅ อัพเดทล่าสุด: ${now.toLocaleTimeString('th-TH')}`;
                
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
    const currentMonthFilter = monthSelect.value;
    
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
    
    // Restore previous selection if still exists
    if (currentMonthFilter && currentMonthFilter !== 'all') {
        const exists = Array.from(monthSelect.options).some(opt => opt.value === currentMonthFilter);
        if (exists) {
            monthSelect.value = currentMonthFilter;
        }
    }
}

// Event listeners

// Date range filter
document.getElementById('dateRange').addEventListener('change', (e) => {
    const value = e.target.value;
    maxDaysToShow = value === 'all' ? 'all' : parseInt(value);
    console.log(`📅 Date range changed to: ${maxDaysToShow === 'all' ? 'All' : maxDaysToShow + ' days'}`);
    
    if (cachedBookings) {
        renderCachedData(1);
    }
});

// Month filter
let currentMonthFilter = 'all';
document.getElementById('monthFilter').addEventListener('change', (e) => {
    currentMonthFilter = e.target.value;
    console.log(`📆 Month filter changed to: ${currentMonthFilter}`);
    
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
    
    const contentDiv = document.getElementById('content');
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
