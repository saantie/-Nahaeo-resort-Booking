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
    console.log('📊 Building booking table...');
    const { data } = sheetData;
    
    console.log('Total data rows:', data.length);
    
    // Filter valid bookings
    const bookings = data.filter(row => {
        return row['Date_ck_in'] && row['Date_ck_out'];
    });
    
    console.log('Valid bookings:', bookings.length);
    
    if (bookings.length === 0) {
        return `
            <div class="error">
                <h3>ℹ️ ไม่มีข้อมูลการจอง</h3>
                <p>ไม่พบข้อมูลการจองใน Google Sheet</p>
                <p style="margin-top: 10px; font-size: 13px;">
                    กรุณาตรวจสอบว่ามีข้อมูลในคอลัมน์ Date_ck_in และ Date_ck_out
                </p>
            </div>
        `;
    }
    
    // Get date range (limit to next 90 days max for performance)
    console.log('Getting date range...');
    const dates = getDateRange(bookings);
    console.log('Date range:', dates.length, 'days');
    
    // Limit to 90 days for performance
    const maxDays = 150;
    if (dates.length > maxDays) {
        console.log(`⚠️ Limiting display to ${maxDays} days for performance`);
        dates.length = maxDays;
    }
    
    console.log('Building HTML table...');
    
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
    
    let rowCount = 0;
    dates.forEach((date, dateIndex) => {
        if (dateIndex % 10 === 0) {
            console.log(`Processing row ${dateIndex + 1}/${dates.length}...`);
        }
        
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
        rowCount++;
    });
    
    html += '</tbody></table></div>';
    
    console.log(`✅ Table HTML built: ${rowCount} rows, ${HOUSE_NAMES.length} houses`);
    
    return html;
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
                const tableHTML = buildBookingTable(sheetData);
                
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

// Event listeners
document.getElementById('refreshBtn').addEventListener('click', loadData);

// Initial load
loadData();

// Auto refresh every 5 minutes
setInterval(loadData, 5 * 60 * 1000);
