# POS System - ระบบขายหน้าร้าน

## โครงสร้างโปรเจค

```
pos-system/
├── backend/       - Node.js + Express + PostgreSQL API Server
├── web-admin/     - React Web Admin (Browser)
└── mobile/        - React Native Android POS App
```

## วิธีติดตั้งและใช้งาน

### 1. ติดตั้ง PostgreSQL
- ดาวน์โหลด: https://www.postgresql.org/download/
- สร้าง database: `CREATE DATABASE pos_system;`

### 2. Backend API Server

```bash
cd backend
cp .env.example .env
# แก้ไข .env: DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET
npm install
npm run migrate    # สร้างตาราง
npm run seed       # ใส่ข้อมูลตัวอย่าง
npm run dev        # เริ่ม server port 5000
```

**ข้อมูล login เริ่มต้น:**
- Admin: `admin@pos.com` / `admin1234`
- Cashier: `cashier@pos.com` / `admin1234`

### 3. Web Admin

```bash
cd web-admin
npm install
npm run dev    # เปิด http://localhost:3000
```

### 4. Mobile App (React Native)

```bash
# ต้องติดตั้ง Android Studio และ React Native CLI ก่อน
cd mobile
npm install

# แก้ไข URL ใน src/services/api.js
# API_URL = 'https://YOUR_SERVER_URL/api'

npx react-native run-android
```

## Features ทั้งหมด

| Feature | Web Admin | Android |
|---------|-----------|---------|
| หน้าขาย (POS) | ✅ | ✅ |
| สแกน Barcode (USB HID) | ✅ | ✅ |
| Camera Barcode Scan | - | ✅ |
| ชั่งน้ำหนัก (Serial) | ✅ | ✅ |
| สต๊อกหน้าร้าน/หลังบ้าน | ✅ | ✅ (ดู) |
| รับสินค้าเข้า/จ่ายออก | ✅ | - |
| โอนระหว่างที่เก็บ | ✅ | - |
| แจ้งเตือนสินค้าใกล้หมด | ✅ | ✅ |
| ประวัติการขาย | ✅ | ✅ |
| รายงานรายวัน/รายสัปดาห์ | ✅ | ✅ |
| กราฟกำไร | ✅ | - |
| Export Excel | ✅ | - |
| จัดการสาขา | ✅ | - |
| จัดการผู้ใช้ | ✅ | - |
| Sync Real-time | ✅ | ✅ |

## API Endpoints

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/products
GET    /api/products/barcode/:barcode
POST   /api/products
PUT    /api/products/:id

GET    /api/stock
GET    /api/stock/low-stock
POST   /api/stock/in
POST   /api/stock/out
POST   /api/stock/transfer
PUT    /api/stock/adjust

POST   /api/sales
GET    /api/sales
GET    /api/sales/:id

GET    /api/reports/summary
GET    /api/reports/daily
GET    /api/reports/weekly
GET    /api/reports/profit
GET    /api/reports/export

GET    /api/branches
POST   /api/branches

GET    /api/users
POST   /api/users

GET    /api/scale/ports
POST   /api/scale/connect
GET    /api/scale/weight
```

## เครื่องชั่งน้ำหนัก

แก้ไขใน `.env`:
```
SCALE_PORT=COM3        # Windows: COM3, Linux/Android: /dev/ttyUSB0
SCALE_BAUD_RATE=9600
```

## การ Deploy บน Cloud (VPS)

```bash
# ติดตั้ง PM2
npm install -g pm2

# รัน backend
cd backend
pm2 start src/app.js --name pos-api

# Build web-admin
cd web-admin
npm run build
# นำไฟล์ใน dist/ ขึ้น Nginx
```
