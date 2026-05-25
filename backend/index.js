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
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  SHAREPOINT_SITE_ID,
  EXCEL_ITEM_ID,
  NODE_ENV = 'development',
  PORT = 3000
} = process.env;

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('[DEBUG] Using cached access token');
    return accessToken;
  }

  try {
    console.log('[DEBUG] Requesting new access token...');
    console.log('[DEBUG] TENANT_ID:', TENANT_ID);
    console.log('[DEBUG] CLIENT_ID:', CLIENT_ID);

    const response = await axios.post(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
    console.log('[DEBUG] Access token obtained successfully');
    return accessToken;
  } catch (error) {
    console.error('Failed to get access token:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error('Authentication failed: ' + (error.response?.data?.error_description || error.message));
  }
}

async function readExcelSheet() {
  const token = await getAccessToken();

  try {
    console.log(`[DEBUG] Reading Excel from site: ${SHAREPOINT_SITE_ID}, item: ${EXCEL_ITEM_ID}`);
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/items/${EXCEL_ITEM_ID}/workbook/worksheets('Sheet1')/usedRange`,
      { headers: { Authorization: `Bearer ${token}` } }
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
      from_date: row[3],
      to_date: row[4],
      reason: row[5],
      work_from_home: row[6]
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
  const token = await getAccessToken();

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
      { headers: { Authorization: `Bearer ${token}` } }
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
