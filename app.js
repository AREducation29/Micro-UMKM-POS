let db;
const request = indexedDB.open("posDB", 1);
request.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("transaksi")) {
    db.createObjectStore("transaksi", { keyPath: "id", autoIncrement: true });
  }
};
request.onsuccess = e => { db = e.target.result; };
function showTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
let cart = [];
document.getElementById("transaksi-form").addEventListener("submit", e => {
  e.preventDefault();
  const nama = document.getElementById("namaBarang").value;
  const harga = parseFloat(document.getElementById("hargaBarang").value);
  const qty = parseInt(document.getElementById("qtyBarang").value);
  const ppn = parseFloat(document.getElementById("ppnBarang").value);
  const subtotal = harga * qty;
  const ppnValue = subtotal * (ppn/100);
  const total = subtotal + ppnValue;
  cart.push({ nama, harga, qty, ppn, subtotal, ppnValue, total });
  renderCart();
  e.target.reset();
  document.getElementById("qtyBarang").value = 1;
  document.getElementById("ppnBarang").value = 0;
});
function renderCart(){
  const tbody = document.querySelector("#tabel-transaksi tbody");
  tbody.innerHTML = "";
  let subtotal=0, totalPpn=0, grandTotal=0;
  cart.forEach(item => {
    subtotal += item.subtotal;
    totalPpn += item.ppnValue;
    grandTotal += item.total;
    tbody.innerHTML += `<tr><td>${item.nama}</td><td>${item.qty}</td><td>${item.harga}</td><td>${item.ppn}%</td><td>${item.total}</td></tr>`;
  });
  document.getElementById("subtotal").innerText = subtotal;
  document.getElementById("totalPpn").innerText = totalPpn;
  document.getElementById("grandTotal").innerText = grandTotal;
}
function simpanTransaksi(){
  const tx = db.transaction("transaksi", "readwrite");
  const store = tx.objectStore("transaksi");
  const waktu = new Date().toLocaleString();
  cart.forEach(item => {
    store.add({ waktu, ...item });
  });
  cetakStruk(waktu, cart);
  cart = [];
  renderCart();
}
function cetakStruk(waktu, items){
  let html = `<div class="receipt"><div class="receipt-header"><h3>Warung Makan</h3><p>${waktu}</p></div><table class="receipt-items">`;
  items.forEach(i => {
    html += `<tr><td>${i.nama}</td><td>${i.qty}x${i.harga}</td><td>${i.total}</td></tr>`;
  });
  html += `</table><div class="receipt-totals"><p>Total: ${items.reduce((a,b)=>a+b.total,0)}</p></div><div class="receipt-footer"><p>Terima Kasih</p></div></div>`;
  const receiptWin = window.open("", "Print", "width=400,height=600");
  receiptWin.document.write("<html><head><link rel='stylesheet' href='print.css'></head><body>"+html+"</body></html>");
  receiptWin.document.close();
  receiptWin.print();
}
function generateReport(){
  const filterDate = document.getElementById("filterDate").value;
  const tx = db.transaction("transaksi", "readonly");
  const store = tx.objectStore("transaksi");
  const req = store.getAll();
  req.onsuccess = () => {
    const data = req.result.filter(r => !filterDate || r.waktu.startsWith(filterDate));
    const tbody = document.querySelector("#report-table tbody");
    tbody.innerHTML = "";
    let totalPenjualan=0, totalPpn=0;
    data.forEach(d => {
      tbody.innerHTML += `<tr><td>${d.waktu}</td><td>${d.nama}</td><td>${d.qty}</td><td>${d.harga}</td><td>${d.subtotal}</td><td>${d.ppnValue}</td><td>${d.total}</td></tr>`;
      totalPenjualan += d.total;
      totalPpn += d.ppnValue;
    });
    document.getElementById("report-summary").innerHTML =
      `<p>Total Transaksi: ${data.length}</p><p>Total Penjualan: ${totalPenjualan}</p><p>Total PPN: ${totalPpn}</p>`;
  };
}
function exportCSV(){
  const tx = db.transaction("transaksi", "readonly");
  const store = tx.objectStore("transaksi");
  const req = store.getAll();
  req.onsuccess = () => {
    const rows = req.result.map(r => [r.waktu, r.nama, r.qty, r.harga, r.subtotal, r.ppnValue, r.total]);
    let csv = "Waktu,Nama,Qty,Harga,Subtotal,PPN,Total\n";
    rows.forEach(r => { csv += r.join(",") + "\n"; });
    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "laporan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
}