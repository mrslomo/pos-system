import React, { useState, useEffect, useRef } from 'react';
import { bankAccountAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { Plus, Edit2, Trash2, QrCode, X, Printer, CreditCard, Smartphone } from 'lucide-react';

// ─────────────────────────────────────────────
// PromptPay QR payload (EMVCo / Thai QR Payment standard)
// ─────────────────────────────────────────────
function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag, value) {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function buildPromptPayPayload(promptpayNumber, amount = null) {
  const num = promptpayNumber.replace(/[^0-9]/g, '');
  let account;
  if (num.length === 10 && num.startsWith('0')) {
    // Mobile phone: 0XXXXXXXXX → 0066XXXXXXXXX
    account = '0066' + num.slice(1);
  } else if (num.length === 13) {
    // National ID or Tax ID: 13 digits
    account = num;
  } else {
    return null;
  }

  // Sub-tag: 01 = phone, 02 = national/tax ID
  const subTag = num.length === 10 ? '01' : '02';
  const merchantAccount = tlv('00', 'A000000677010111') + tlv(subTag, account);
  const pointOfInit = amount ? '010211' : '010212'; // 11=dynamic(with amount), 12=static

  let payload =
    tlv('00', '01') +
    pointOfInit +
    tlv('29', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '764') +
    (amount ? tlv('54', parseFloat(amount).toFixed(2)) : '') +
    tlv('58', 'TH') +
    tlv('59', 'PromptPay') +
    tlv('60', 'Bangkok') +
    '6304';

  return payload + crc16ccitt(payload);
}

// Build a plain text QR for bank account (not a payment QR — just info)
function buildBankAccountPayload(bank, accountNumber, accountName) {
  return `${bank}\nเลขบัญชี: ${accountNumber}\nชื่อบัญชี: ${accountName}`;
}

// ─────────────────────────────────────────────

const THAI_BANKS = [
  { name: 'ธนาคารกสิกรไทย (KBANK)', color: '#138F2D', logo: '💚' },
  { name: 'ธนาคารไทยพาณิชย์ (SCB)', color: '#4E2E8D', logo: '💜' },
  { name: 'ธนาคารกรุงเทพ (BBL)', color: '#1B4DA3', logo: '💙' },
  { name: 'ธนาคารกรุงไทย (KTB)', color: '#00A1E0', logo: '🔵' },
  { name: 'ธนาคารกรุงศรีอยุธยา (BAY)', color: '#FDD100', logo: '💛' },
  { name: 'ธนาคารทหารไทยธนชาต (TTB)', color: '#FF6200', logo: '🟠' },
  { name: 'ธนาคารออมสิน (GSB)', color: '#EB008B', logo: '🟣' },
  { name: 'ธนาคารเพื่อการเกษตรและสหกรณ์ (BAAC)', color: '#4CAF50', logo: '🟢' },
  { name: 'ธนาคารอิสลาม (IBANK)', color: '#008F5D', logo: '🌿' },
  { name: 'ธนาคารซีไอเอ็มบีไทย (CIMB)', color: '#CE0F26', logo: '🔴' },
  { name: 'ธนาคารยูโอบี (UOB)', color: '#003DA5', logo: '🔷' },
  { name: 'ธนาคารแลนด์แอนด์เฮ้าส์ (LHB)', color: '#005BAC', logo: '🏠' },
  { name: 'ธนาคารทิสโก้ (TISCO)', color: '#003087', logo: '🏦' },
  { name: 'ธนาคารเกียรตินาคินภัทร (KKP)', color: '#00688B', logo: '🌊' },
  { name: 'ธนาคารไทยเครดิต (TCRB)', color: '#F47920', logo: '🟡' },
];

const EMPTY_FORM = {
  account_type: 'bank',
  account_label: '',
  bank_name: '',
  account_number: '',
  account_name: '',
  promptpay_number: '',
};

function AccountModal({ account, onClose, onSave, branchId }) {
  const [form, setForm] = useState(account ? { ...account } : { ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);

  const f = (k) => ({
    value: form[k] ?? '',
    onChange: (e) => setForm(p => ({ ...p, [k]: e.target.value })),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.account_name.trim()) return toast.error('ต้องระบุชื่อบัญชี');
    if (form.account_type === 'bank' && !form.account_number.trim()) return toast.error('ต้องระบุเลขบัญชี');
    if (form.account_type !== 'bank' && !form.promptpay_number.trim()) return toast.error('ต้องระบุเบอร์/เลขบัตร');
    setLoading(true);
    try {
      if (account?.id) {
        await bankAccountAPI.update(account.id, form);
        toast.success('อัปเดตสำเร็จ');
      } else {
        await bankAccountAPI.create({ ...form, branch_id: branchId });
        toast.success('เพิ่มบัญชีสำเร็จ');
      }
      onSave();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">{account?.id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีรับเงิน'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'bank', label: '🏦 บัญชีธนาคาร', desc: 'เลขบัญชีธนาคาร' },
                { value: 'promptpay', label: '📱 พร้อมเพย์', desc: 'เบอร์มือถือ / เลขบัตร' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(p => ({ ...p, account_type: opt.value }))}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${form.account_type === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อแสดง (label)</label>
            <input {...f('account_label')} required className="input" placeholder="เช่น บัญชีหลัก, พร้อมเพย์ส่วนตัว" />
          </div>

          {form.account_type === 'bank' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ธนาคาร</label>
                <select {...f('bank_name')} className="input">
                  <option value="">-- เลือกธนาคาร --</option>
                  {THAI_BANKS.map(b => <option key={b.name} value={b.name}>{b.logo} {b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัญชี *</label>
                <input {...f('account_number')} className="input font-mono" placeholder="000-0-00000-0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบัญชี *</label>
                <input {...f('account_name')} className="input" placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์มือถือ หรือเลขบัตรประชาชน *</label>
                <input {...f('promptpay_number')} className="input font-mono" placeholder="0812345678 หรือ 1234567890123" />
                <p className="text-xs text-gray-400 mt-1">เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบัญชี (แสดงบน QR) *</label>
                <input {...f('account_name')} className="input" placeholder="ชื่อ-นามสกุล หรือชื่อร้าน" />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">ยกเลิก</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QRModal({ account, onClose }) {
  const printRef = useRef();

  const qrPayload = account.account_type === 'promptpay'
    ? buildPromptPayPayload(account.promptpay_number)
    : buildBankAccountPayload(account.bank_name || '', account.account_number, account.account_name);

  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>QR Code - ${account.account_label}</title>
      <style>
        body { font-family: 'Sarabun', sans-serif; text-align: center; padding: 20px; }
        .qr-box { display: inline-block; padding: 20px; border: 2px solid #e5e7eb; border-radius: 12px; }
        h2 { font-size: 18px; margin-bottom: 4px; }
        p { color: #6b7280; font-size: 14px; margin: 2px 0; }
        .account-num { font-size: 16px; color: #111827; font-weight: bold; font-family: monospace; }
        @media print { button { display: none; } }
      </style></head><body>
      <div class="qr-box">
        ${printRef.current?.innerHTML || ''}
        <h2>${account.account_label}</h2>
        ${account.bank_name ? `<p>${account.bank_name}</p>` : ''}
        ${account.account_number ? `<p class="account-num">เลขบัญชี: ${account.account_number}</p>` : ''}
        ${account.promptpay_number ? `<p class="account-num">พร้อมเพย์: ${account.promptpay_number}</p>` : ''}
        <p>${account.account_name}</p>
      </div>
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">QR Code รับเงิน</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-6 text-center">
          <div ref={printRef} className="inline-block p-4 bg-white border-2 border-gray-200 rounded-xl mb-4">
            {qrPayload ? (
              <QRCode value={qrPayload} size={200} level="M" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center bg-red-50 rounded text-red-500 text-sm">
                เบอร์/เลขบัตรไม่ถูกต้อง
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="font-bold text-lg text-gray-900">{account.account_label}</p>
            {account.bank_name && <p className="text-sm text-gray-500">{account.bank_name}</p>}
            {account.account_number && (
              <p className="font-mono font-semibold text-gray-800">{account.account_number}</p>
            )}
            {account.promptpay_number && (
              <p className="font-mono font-semibold text-gray-800">📱 {account.promptpay_number}</p>
            )}
            <p className="text-gray-600">{account.account_name}</p>
            {account.account_type === 'promptpay' && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mt-2 inline-block">
                ✓ มาตรฐาน Thai QR Payment (PromptPay)
              </p>
            )}
          </div>
        </div>
        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">ปิด</button>
          <button onClick={handlePrint} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Printer size={15} /> พิมพ์ QR
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BankQRPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);

  const load = () => {
    setLoading(true);
    bankAccountAPI.list({ branch_id: user.branch_id })
      .then(r => setAccounts(r.accounts || []))
      .catch(() => toast.error('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('ลบบัญชีนี้?')) return;
    try { await bankAccountAPI.delete(id); toast.success('ลบสำเร็จ'); load(); }
    catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">บัญชีรับเงิน & QR Code</h1>
          <p className="text-gray-500 text-sm">จัดการบัญชีธนาคารและ PromptPay สำหรับปริ้น QR ให้ลูกค้า</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> เพิ่มบัญชี
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-600" /></div>
      ) : accounts.length === 0 ? (
        <div className="card text-center py-16">
          <QrCode size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">ยังไม่มีบัญชีรับเงิน</p>
          <p className="text-gray-400 text-sm mb-4">เพิ่มบัญชีธนาคารหรือ PromptPay เพื่อสร้าง QR Code</p>
          <button onClick={() => setModal({})} className="btn-primary mx-auto">
            <Plus size={16} className="inline mr-1" /> เพิ่มบัญชีแรก
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const isPromptPay = acc.account_type === 'promptpay';
            return (
              <div key={acc.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg ${isPromptPay ? 'bg-blue-500' : 'bg-indigo-500'}`}>
                      {isPromptPay ? <Smartphone size={20} /> : <CreditCard size={20} />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{acc.account_label}</p>
                      <p className="text-xs text-gray-400">{isPromptPay ? 'PromptPay' : 'บัญชีธนาคาร'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModal(acc)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(acc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="text-sm text-gray-600 space-y-1 mb-4">
                  {acc.bank_name && <p className="text-gray-500">{acc.bank_name}</p>}
                  {acc.account_number && <p className="font-mono font-semibold text-gray-800">{acc.account_number}</p>}
                  {acc.promptpay_number && <p className="font-mono font-semibold text-blue-700">📱 {acc.promptpay_number}</p>}
                  <p className="text-gray-700">{acc.account_name}</p>
                </div>

                <button
                  onClick={() => setQrModal(acc)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-sm font-medium text-gray-700 hover:text-blue-600 transition-all"
                >
                  <QrCode size={15} /> ดู QR Code
                </button>
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && (
        <AccountModal
          account={modal.id ? modal : null}
          branchId={user.branch_id}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}
      {qrModal && (
        <QRModal account={qrModal} onClose={() => setQrModal(null)} />
      )}
    </div>
  );
}
