const { google } = require('googleapis');
const path = require('path');

// Load credentials
const CREDENTIALS_PATH = path.join(__dirname, '../credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Auth client
const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Exames'; // Assumes a sheet named 'Exames'

// Helper to find row by ID (Assuming ID is in Column A)
async function findRowIndexById(id) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:A`,
    });
    const rows = response.data.values;
    if (!rows) return -1;
    // rows is [[id], [id], ...]
    return rows.findIndex(row => row[0] === id); // 0-indexed relative to array, but Sheet rows are 1-indexed
}

async function getExams() {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2:H`, // Extended to H for Category
    });

    const rows = response.data.values;
    if (!rows) return [];

    // Map and filter out potential header row if it slipped into A2
    return rows
        .map(row => ({
            id: row[0],
            name: row[1],
            price: parseFloat(row[2]) || 0,
            prazo: row[3],
            preparo: row[4],
            jejum: row[5],
            description: row[6],
            category: row[7] || 'Geral' // Reads from H, defaults to Geral
        }))
        .filter(exam => exam.id !== 'ID' && exam.id !== 'id'); // Simple filter
}

async function createExam(exam) {
    const id = Date.now().toString();
    // Mapping: ID, Name, Price, Prazo, Preparo, Jejum, Description
    // Note: incoming exam object might not have all new fields yet, handling defaults.
    const values = [[
        id,
        exam.name,
        exam.price,
        exam.prazo || '',
        exam.preparo || '',
        exam.jejum || '',
        exam.description,
        exam.category || 'Geral'
    ]];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:H`,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });

    return { id, ...exam };
}

async function updateExam(id, exam) {
    const rowIndex = await findRowIndexById(id);
    if (rowIndex === -1) throw new Error('Exam not found');

    const sheetRow = rowIndex + 1;

    const values = [[
        id,
        exam.name,
        exam.price,
        exam.prazo || '',
        exam.preparo || '',
        exam.jejum || '',
        exam.description,
        exam.category || 'Geral'
    ]];

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${sheetRow}:H${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });

    return { id, ...exam };
}

async function deleteExam(id) {
    // Deleting rows in Sheets is tricky with just 'values.clear', 
    // actually deleting the row requires 'batchUpdate'.
    // For simplicity, we'll clear the content or mark as deleted.
    // Let's implement actual row deletion for "Pro" feel.

    const rowIndex = await findRowIndexById(id);
    if (rowIndex === -1) throw new Error('Exam not found');

    // rowIndex is 0-based index from the values.get call. 
    // If we fetched A:A, row 0 is actually Sheet Row 1.

    const request = {
        deleteDimension: {
            range: {
                sheetId: 0, // IMPORTANT: Requires GID 0 (first sheet). If 'Exames' is not first, need to fetch sheetId.
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1
            }
        }
    };

    // Note: To use delete, we need the SheetID (GID), not just name. 
    // Assuming default sheet (GID 0) for MVP.
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests: [request] }
    });

    return true;
}

const ORDERS_SHEET_NAME = 'Pedidos';

async function createOrder(orderData) {
    console.log('Creating Order with Data:', JSON.stringify(orderData, null, 2)); // DEBUG
    // 1. Get existing orders to determine next ID
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${ORDERS_SHEET_NAME}!A:A`,
    });

    const rows = response.data.values;
    let nextId = 1;

    if (rows && rows.length > 1) { // Assuming header row
        // Extract numeric part from last ID (e.g., "00001" -> 1)
        // We look at the last row
        const lastRow = rows[rows.length - 1];
        const lastIdStr = lastRow[0];
        const lastIdNum = parseInt(lastIdStr, 10);
        if (!isNaN(lastIdNum)) {
            nextId = lastIdNum + 1;
        }
    }

    // Format ID as 00001
    const protocol = String(nextId).padStart(5, '0');

    // 2. Prepare Row Data
    // Columns: Protocolo, Nome, CPF, Telefone, Email, Itens (JSON), Total, Data
    const itemsJson = JSON.stringify(orderData.items.map(i => ({ name: i.name, price: i.price, prazo: i.prazo })));
    const timestamp = new Date().toLocaleString('pt-BR');


    // Format collection info
    let addressString = '';
    if (orderData.collectionType === 'Domiciliar' && orderData.address) {
        const addr = orderData.address;
        addressString = `${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city} (${addr.zip})`;
        if (addr.complement) addressString += ` comp: ${addr.complement}`;
    }

    // Format scheduled date
    let formattedDate = orderData.scheduledDate || '';
    if (formattedDate) {
        const [year, month, day] = formattedDate.split('-');
        formattedDate = `${day}/${month}/${year}`;
    }

    const values = [[
        protocol,
        orderData.customer.name,
        orderData.customer.cpf,
        orderData.customer.phone,
        orderData.customer.email,
        itemsJson,
        orderData.total,
        timestamp,
        orderData.collectionType || 'Laboratório', // Column I: Collection Type
        addressString, // Column J: Full Address
        formattedDate // Column K: Scheduled Date
    ]];

    // 3. Append to Sheet
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${ORDERS_SHEET_NAME}!A:K`, // Extended to K
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });

    return { protocol, ...orderData };
}

module.exports = {
    getExams,
    createExam,
    updateExam,
    deleteExam,
    createOrder,
    getOrders,
    updateOrder
};

async function getOrders() {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${ORDERS_SHEET_NAME}!A2:M`, // Extended to M
    });

    const rows = response.data.values;
    if (!rows) return [];

    return rows.map(row => {
        // Safe JSON parse for items
        let items = [];
        try {
            items = JSON.parse(row[5] || '[]');
        } catch (e) {
            console.error('Error parsing items json', e);
        }

        return {
            protocol: row[0],
            customer: {
                name: row[1],
                cpf: row[2],
                phone: row[3],
                email: row[4]
            },
            items: items,
            total: row[6],
            timestamp: row[7],
            collectionType: row[8],
            address: row[9],
            scheduledDate: row[10],
            status: row[11] || 'A Realizar', // Column L
            observation: row[12] || ''       // Column M
        };
    });
}

// Helper to find order row by Protocol (Column A)
async function findOrderRowIndexByProtocol(protocol) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${ORDERS_SHEET_NAME}!A:A`,
    });
    const rows = response.data.values;
    if (!rows) return -1;
    return rows.findIndex(row => row[0] === protocol);
}

async function updateOrder(protocol, updateData) {
    const rowIndex = await findOrderRowIndexByProtocol(protocol);
    if (rowIndex === -1) throw new Error('Order not found');

    const sheetRow = rowIndex + 1; // 1-based index

    // We only update Status (Col L) and Observation (Col M)
    // Col L is index 11 (A=0), Col M is index 12
    // Range L{row}:M{row}

    const values = [[
        updateData.status,
        updateData.observation
    ]];

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${ORDERS_SHEET_NAME}!L${sheetRow}:M${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });

    return { protocol, ...updateData };
}
