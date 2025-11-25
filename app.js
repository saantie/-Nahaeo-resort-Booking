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
        console.log('🚀 Method 2: Fetching from Google Sheets CSV export...');
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
        
        const response = await fetch(csvUrl, {
            method: 'GET',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        
        const csvText = await response.text();
        
        if (!csvText || csvText.length < 10) {
            throw new Error('ไม่มีข้อมูลใน Sheet หรือ Sheet ไม่ใช่ Public');
        }
        
        // Parse CSV to JSON
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = values[index] || '';
            });
            return obj;
        }).filter(row => Object.values(row).some(v => v.trim() !== ''));
        
        console.log('✅ CSV data loaded successfully!');
        console.log('Data rows:', data.length);
        
        return { headers, data };
    } catch (error) {
        console.error('❌ Error fetching data:', error);
        throw error;  // Re-throw to handle in caller
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

// Function to build the booking table (assume this was in truncated part; implement basic version based on context)
function buildBookingTable(sheetData, page) {
    // Basic implementation: Generate table HTML from data
    // This is placeholder; adjust based on your full logic
    const startRow = (page - 1) * ROWS_PER_PAGE;
    const endRow = startRow + ROWS_PER_PAGE;
    const paginatedData = sheetData.data.slice(startRow, endRow);
    
    let html = '<table><thead><tr><th>วันที่</th>';
    HOUSE_NAMES.forEach(house => {
        html += `<th>${house}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    paginatedData.forEach(row => {
        const date = parseDate(row['วันที่']);  // Assume column 'วันที่'
        if (date) {
            html += `<tr><td class="date-cell">${formatDateThai(date)}</td>`;
            HOUSE_NAMES.forEach((house, index) => {
                const booking = row[SPLIT_COLUMNS[index]] || '';  // Assume bookings in SPLIT columns
                html += `<td class="booking-cell">${booking ? booking : '-'}</td>`;
            });
            html += '</tr>';
        }
    });
    
    html += '</tbody></table>';
    
    totalPages = Math.ceil(sheetData.data.length / ROWS_PER_PAGE);
    currentPage = page;
    updatePagination();
    
    return html;
}

// Update pagination info (assume this was truncated)
function updatePagination() {
    document.getElementById('pageInfo').textContent = `หน้า ${currentPage}/${totalPages}`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
}

// Load data function (with error handling)
async function loadData() {
    const contentDiv = document.getElementById('calendar');
    const lastUpdateDiv = document.getElementById('lastUpdate');  // Assume you add this if needed
    
    contentDiv.innerHTML = '<div class="loading">📡 กำลังโหลดข้อมูลจาก Google Sheets...</div>';
    
    try {
        const sheetData = await fetchSheetData();
        
        if (!sheetData.data || sheetData.data.length === 0) {
            throw new Error('ไม่มีข้อมูลใน Sheet');
        }
        
        // Process bookings (assume sort by date)
        cachedBookings = sheetData.data.sort((a, b) => {
            const dateA = parseDate(a['วันที่']);
            const dateB = parseDate(b['วันที่']);
            return dateA - dateB;
        });
        
        // Get all dates for month filter
        const dates = cachedBookings
            .map(row => parseDate(row['วันที่']))
            .filter(date => date !== null);
        
        populateMonthFilter(dates);
        
        // Render initial page
        renderCachedData(1);
        
        // Update last update
        if (lastUpdateDiv) {
            lastUpdateDiv.innerHTML = `อัพเดทล่าสุด: ${formatDateThai(new Date())}`;
        }
        
    } catch (error) {
        console.error('❌ Load data error:', error);
        let errorMessage = error.message || 'ไม่ทราบสาเหตุ';
        let suggestions = '';
        
        if (errorMessage.includes('WEB_APP_URL')) {
            suggestions = `
                <div style="margin-top: 15px; padding: 12px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
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
        if (lastUpdateDiv) lastUpdateDiv.innerHTML = '❌ โหลดข้อมูลล้มเหลว';
    }
}

// Initial load
loadData();

// Auto refresh every 5 minutes
setInterval(loadData, 5 * 60 * 1000);
