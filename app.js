// Configuration
const SHEET_ID = '1IshovQni9Eiq9IeRdDg_2cXTSSkC7YIK2fbDTm_dcs0';
const SHEET_NAME = 'booking';
const API_KEY = 'YOUR_API_KEY_HERE'; // ผู้ใช้ต้องใส่ API Key ของตัวเอง

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
    
    // Try different date formats
    const formats = [
        // DD/MM/YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        // MM/DD/YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        // YYYY-MM-DD
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    ];
    
    for (let format of formats) {
        const match = dateStr.match(format);
        if (match) {
            if (format.source.startsWith('^(\\d{4})')) {
                // YYYY-MM-DD format
                return new Date(match[1], match[2] - 1, match[3]);
            } else {
                // Try both DD/MM/YYYY and MM/DD/YYYY
                const date1 = new Date(match[3], match[2] - 1, match[1]);
                const date2 = new Date(match[3], match[1] - 1, match[2]);
                
                // Use the one that makes more sense (day <= 31, month <= 12)
                if (match[1] <= 12 && match[2] <= 31) {
                    return date1; // DD/MM/YYYY
                } else if (match[2] <= 12 && match[1] <= 31) {
                    return date2; // MM/DD/YYYY
                }
                return date1; // Default to DD/MM/YYYY
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
        // Use CSV export (no API key needed, but sheet must be public)
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error('ไม่สามารถเชื่อมต่อ Google Sheet ได้ กรุณาตรวจสอบว่าแชร์เป็น Public แล้ว');
        }
        
        const csvText = await response.text();
        return parseCSV(csvText);
    } catch (error) {
        console.error('Error fetching data:', error);
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
    
    let maxDate = new Date(today);
    
    bookings.forEach(booking => {
        const checkOut = parseDate(booking['Date_ck_out']);
        if (checkOut && checkOut > maxDate) {
            maxDate = checkOut;
        }
    });
    
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
    
    if (!ci || !co) return false;
    
    ci.setHours(0, 0, 0, 0);
    co.setHours(0, 0, 0, 0);
    
    return d >= ci && d < co;
}

// Build booking table
function buildBookingTable(sheetData) {
    const { data } = sheetData;
    
    // Filter valid bookings
    const bookings = data.filter(row => {
        return row['Date_ck_in'] && row['Date_ck_out'];
    });
    
    // Get date range
    const dates = getDateRange(bookings);
    
    // Build table HTML
    let html = '<div class="table-wrapper"><table>';
    
    // Header row
    html += '<thead><tr>';
    html += '<th class="date-column">วันที่</th>';
    HOUSE_NAMES.forEach(houseName => {
        html += `<th>${houseName}</th>`;
    });
    html += '</tr></thead>';
    
    // Body rows
    html += '<tbody>';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    dates.forEach(date => {
        const isToday = date.getTime() === today.getTime();
        html += '<tr>';
        html += `<td class="date-cell ${isToday ? 'today-row' : ''}">${formatDateThai(date)}</td>`;
        
        // Check each house for bookings on this date
        SPLIT_COLUMNS.forEach((splitCol, houseIndex) => {
            let cellContent = '';
            let hasBooking = false;
            
            bookings.forEach(booking => {
                if (booking[splitCol] && isDateInBooking(date, booking['Date_ck_in'], booking['Date_ck_out'])) {
                    hasBooking = true;
                    
                    cellContent += '<div class="booking-info">';
                    
                    if (booking['Customer']) {
                        cellContent += `<div class="customer-name">👤 ${booking['Customer']}</div>`;
                    }
                    
                    if (booking['Phone_no']) {
                        cellContent += `<div class="phone">📱 ${booking['Phone_no']}</div>`;
                    }
                    
                    if (booking['Total_Price']) {
                        cellContent += `<div class="price">💰 ${booking['Total_Price']} บาท</div>`;
                    }
                    
                    if (booking['overdue']) {
                        cellContent += `<div class="overdue">⚠️ ค้าง: ${booking['overdue']} บาท</div>`;
                    }
                    
                    if (booking['Other']) {
                        cellContent += `<div class="other">📝 ${booking['Other']}</div>`;
                    }
                    
                    cellContent += '</div>';
                }
            });
            
            if (hasBooking) {
                html += `<td class="booking-cell">${cellContent}</td>`;
            } else {
                html += '<td class="empty-cell">-</td>';
            }
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    
    return html;
}

// Load and display data
async function loadData() {
    const contentDiv = document.getElementById('content');
    const lastUpdateDiv = document.getElementById('lastUpdate');
    
    try {
        contentDiv.innerHTML = '<div class="loading"><div>⏳ กำลังโหลดข้อมูล...</div></div>';
        
        const sheetData = await fetchSheetData();
        const tableHTML = buildBookingTable(sheetData);
        
        contentDiv.innerHTML = tableHTML;
        
        const now = new Date();
        lastUpdateDiv.innerHTML = `อัพเดทล่าสุด: ${now.toLocaleTimeString('th-TH')}`;
        
    } catch (error) {
        contentDiv.innerHTML = `
            <div class="error">
                <h3>❌ เกิดข้อผิดพลาด</h3>
                <p>${error.message}</p>
                <p style="margin-top: 10px; font-size: 12px;">
                    โปรดตรวจสอบ:<br>
                    1. Google Sheet ต้องแชร์เป็น "Anyone with the link can view"<br>
                    2. Sheet name ต้องเป็น "booking"<br>
                    3. มีคอลัมน์ทั้งหมดที่ระบุ
                </p>
            </div>
        `;
        lastUpdateDiv.innerHTML = 'โหลดข้อมูลล้มเหลว';
    }
}

// Event listeners
document.getElementById('refreshBtn').addEventListener('click', loadData);

// Initial load
loadData();

// Auto refresh every 5 minutes
setInterval(loadData, 5 * 60 * 1000);
