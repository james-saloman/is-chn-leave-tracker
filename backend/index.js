const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

const {
  SHAREPOINT_SITE_ID,
  EXCEL_ITEM_ID,
  SERVICE_ACCOUNT_EMAIL,
  SERVICE_ACCOUNT_PASSWORD,
  NODE_ENV = 'development',
  PORT = 3000
} = process.env;

function getBasicAuthHeader() {
  const credentials = Buffer.from(`${SERVICE_ACCOUNT_EMAIL}:${SERVICE_ACCOUNT_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

async function readExcelSheet() {
  try {
    console.log(`[DEBUG] Reading Excel from site: ${SHAREPOINT_SITE_ID}, item: ${EXCEL_ITEM_ID}`);
    const url = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/items/${EXCEL_ITEM_ID}/workbook/worksheets('Sheet1')/usedRange`;
    console.log(`[DEBUG] API URL: ${url}`);
    const response = await axios.get(
      url,
      { headers: { Authorization: getBasicAuthHeader() } }
    );

    const { values } = response.data;
    if (!values || values.length === 0) {
      console.log('[DEBUG] No data in Excel sheet, returning empty array');
      return [];
    }

    console.log(`[DEBUG] Read ${values.length} rows from Excel`);
    return values.slice(1).map(row => ({
      sNo: row[0],
      name: row[1],
      member_id: row[2],
      from_leave: row[3],
      end_leave: row[4],
      reason: row[5],
      wfh: row[6]
    }));
  } catch (error) {
    console.error('Failed to read Excel:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
}

async function appendToExcelSheet(data) {
  try {
    const rows = await readExcelSheet();
    const nextSNo = rows.length + 1;
    const timestamp = new Date().toISOString();

    const newRow = [
      nextSNo,
      data.name,
      data.id,
      data.from_leave,
      data.end_leave,
      data.reason,
      data.wfh ? 'Yes' : 'No',
      timestamp
    ];

    await axios.patch(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/items/${EXCEL_ITEM_ID}/workbook/worksheets('Sheet1')/range(address='A${nextSNo + 1}:H${nextSNo + 1}')`,
      { values: [newRow] },
      { headers: { Authorization: getBasicAuthHeader() } }
    );

    return { status: 'ok' };
  } catch (error) {
    console.error('Failed to append to Excel:', error.response?.data || error.message);
    throw error;
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/leaves', async (req, res) => {
  try {
    const leaves = await readExcelSheet();
    res.json(leaves);
  } catch (error) {
    console.error('GET /api/leaves error:', error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

app.post('/api/leaves', async (req, res) => {
  try {
    const { name, id, from_leave, end_leave, reason, wfh } = req.body;

    if (!name || !id || !from_leave || !end_leave || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await appendToExcelSheet({ name, id, from_leave, end_leave, reason, wfh });
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('POST /api/leaves error:', error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
