document.addEventListener('DOMContentLoaded', () => {
    // Make jsPDF available globally
    window.jsPDF = window.jspdf.jsPDF;

    let db;
    const request = indexedDB.open("posDB_UMKM_Pro", 9); // Increased version number

    // --- State Variables ---
    const state = {
        produk: { currentPage: 1, itemsPerPage: 10, searchQuery: '' },
        inventaris: { currentPage: 1, itemsPerPage: 10, searchQuery: '' },
        laporan: { currentPage: 1, itemsPerPage: 10, searchQuery: '' }
    };
    let cart = [];
    let produkListCache = [];
    let pajakPersen = 0;
    let currentKategori = 'semua';

    // --- DB Setup ---
    request.onupgradeneeded = e => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("inventaris")) {
            db.createObjectStore("inventaris", { keyPath: "nama" });
        }
        if (!db.objectStoreNames.contains("produk")) {
            const produkStore = db.createObjectStore("produk", { keyPath: "nama" });
            // Add sample data
            produkStore.add({ nama: "Kopi Susu", kategori: "minuman", hargaJual: 15000, hpp: 8000 });
            produkStore.add({ nama: "Teh Manis", kategori: "minuman", hargaJual: 8000, hpp: 4000 });
            produkStore.add({ nama: "Nasi Goreng", kategori: "makanan", hargaJual: 20000, hpp: 12000 });
            produkStore.add({ nama: "Mie Goreng", kategori: "makanan", hargaJual: 18000, hpp: 10000 });
            produkStore.add({ nama: "Kerupuk", kategori: "snack", hargaJual: 3000, hpp: 1500 });
        }
        if (!db.objectStoreNames.contains("transaksi")) {
            db.createObjectStore("transaksi", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pengaturan")) {
            const settingsStore = db.createObjectStore("pengaturan", { keyPath: "id" });
            settingsStore.add({ id: "toko", namaToko: "Toko Saya", alamatToko: "", teleponToko: "" });
        }
        if (!db.objectStoreNames.contains("riwayatStok")) {
            db.createObjectStore("riwayatStok", { keyPath: "id", autoIncrement: true });
        }
    };
    
    request.onsuccess = e => {
        db = e.target.result;
        initializeUI();
    };
    
    request.onerror = e => console.error("IndexedDB error:", e.target.errorCode);

    // --- UI Initialization ---
    function initializeUI() {
        renderAllTables();
        setupEventListeners();
        showTab('kasir');
        updateClock();
        setInterval(updateClock, 1000);
        
        // Load initial produk list for kasir
        loadProdukForKasirList();
        
        // Set up pajak toggle
        document.getElementById('pajak-toggle').addEventListener('change', function() {
            const pajakInput = document.getElementById('pajak-persen');
            const pajakRow = document.getElementById('pajak-row');
            
            if (this.checked) {
                pajakInput.style.display = 'inline-block';
                pajakRow.style.display = 'flex';
                pajakPersen = parseFloat(pajakInput.value) || 0;
            } else {
                pajakInput.style.display = 'none';
                pajakRow.style.display = 'none';
                pajakPersen = 0;
            }
            updateCartSummary();
        });
        
        document.getElementById('pajak-persen').addEventListener('input', function() {
            pajakPersen = parseFloat(this.value) || 0;
            updateCartSummary();
        });

        // Set up theme switch
        const toggleSwitch = document.querySelector('#checkbox');
        const currentTheme = localStorage.getItem('theme') || 'light';
        
        if (currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            toggleSwitch.checked = true;
        }
        
        toggleSwitch.addEventListener('change', switchTheme);
        
        // Set up kategori buttons
        document.querySelectorAll('.kategori-btn').forEach(button => {
            button.addEventListener('click', function() {
                document.querySelector('.kategori-btn.active').classList.remove('active');
                this.classList.add('active');
                currentKategori = this.getAttribute('data-kategori');
                loadProdukForKasirList(document.getElementById('search-produk-kasir').value);
            });
        });
    }

    function updateClock() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeString = now.toLocaleTimeString('id-ID');
        const dateString = now.toLocaleDateString('id-ID', options);
        document.getElementById('current-time').textContent = `${dateString} ${timeString}`;
    }

    function switchTheme(e) {
        if (e.target.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }    
    }

    function renderAllTables() {
        renderProdukTable();
        renderInventarisTable();
        generateReport();
    }
    
    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Sidebar Toggle
        document.getElementById('toggle-sidebar').addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });
        
        document.getElementById('toggle-sidebar-mobile').addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });

        // Forms
        document.getElementById("inventaris-form").addEventListener("submit", handleInventarisForm);
        document.getElementById("produk-form").addEventListener("submit", handleProdukForm);
        document.getElementById("pengaturan-form").addEventListener("submit", handlePengaturanForm);
        document.getElementById("edit-produk-form").addEventListener("submit", handleEditProdukForm);
        document.getElementById("stok-keluar-form").addEventListener("submit", handleStokKeluarForm);

        // Clear Form Buttons
        document.getElementById("clear-inventaris-form").addEventListener("click", () => document.getElementById("inventaris-form").reset());
        document.getElementById("clear-produk-form").addEventListener("click", () => document.getElementById("produk-form").reset());
        
        // Kasir Actions
        document.getElementById("batal-transaksi").addEventListener("click", batalTransaksi);
        document.getElementById("simpan-transaksi").addEventListener("click", simpanTransaksi);
        document.getElementById("jumlahBayar").addEventListener("input", calculateChange);
        document.querySelector('.quick-cash-buttons').addEventListener('click', handleQuickCash);
        
        // Search Inputs
        document.getElementById("search-produk-kasir").addEventListener("input", (e) => loadProdukForKasirList(e.target.value));
        document.getElementById("search-produk").addEventListener("input", (e) => { state.produk.searchQuery = e.target.value; renderProdukTable(1); });
        document.getElementById("search-inventaris").addEventListener("input", (e) => { state.inventaris.searchQuery = e.target.value; renderInventarisTable(1); });
        
        // Pagination Dropdowns
        ['produk', 'inventaris', 'laporan'].forEach(module => {
            const element = document.getElementById(`${module}-items-per-page`);
            if (element) {
                element.addEventListener('change', (e) => handleItemsPerPageChange(module, e.target.value));
            }
        });

        // Laporan filter
        const filterDate = document.getElementById("filterDate");
        if (filterDate) {
            filterDate.value = new Date().toISOString().slice(0, 10);
            filterDate.addEventListener("change", () => generateReport(1));
        }
        
        // Tampilkan Laporan button
        const tampilkanLaporanBtn = document.getElementById("tampilkan-laporan");
        if (tampilkanLaporanBtn) {
            tampilkanLaporanBtn.addEventListener("click", () => generateReport(1));
        }
        
        // Export Buttons
        const exportProdukBtn = document.getElementById('export-produk-pdf');
        if (exportProdukBtn) {
            exportProdukBtn.addEventListener('click', () => exportToPDF('produk'));
        }
        
        const exportInventarisBtn = document.getElementById('export-inventaris-pdf');
        if (exportInventarisBtn) {
            exportInventarisBtn.addEventListener('click', () => exportToPDF('inventaris'));
        }
        
        const exportLaporanBtn = document.getElementById('export-laporan-pdf');
        if (exportLaporanBtn) {
            exportLaporanBtn.addEventListener('click', () => exportToPDF('laporan'));
        }
        
        // Modal close buttons
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal-overlay').style.display = 'none';
            });
        });
        
        // Close modal when clicking outside
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    // --- Generic DB Operations ---
    function performDBAction(storeName, mode, action, data, callback) {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let request;

        switch (action) {
            case 'put': request = store.put(data); break;
            case 'get': request = store.get(data); break;
            case 'getAll': request = store.getAll(); break;
            case 'delete': request = store.delete(data); break;
            case 'add': request = store.add(data); break;
        }

        transaction.oncomplete = () => {
            if (callback && typeof request.result !== 'undefined') callback(request.result);
            else if (callback) callback(true);
        };
        transaction.onerror = (e) => {
            console.error(`DB Error on ${storeName}:`, e.target.error);
            if (callback) callback(null, e.target.error);
        };
    }

    // ===============================================
    // UI & TAB MANAGEMENT
    // ===============================================
    window.showTab = function(id) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.querySelectorAll('.nav-button').forEach(b => {
            b.classList.remove('active');
            if (b.getAttribute('onclick').includes(`'${id}'`)) b.classList.add('active');
        });
        
        document.getElementById('main-header-title').textContent = 
            document.querySelector(`.nav-button[onclick="showTab('${id}')"] .sidebar-text`).textContent;
        
        if(id === 'kasir') loadProdukForKasirList();
    }
    
    // ===============================================
    // INVENTARIS MANAGEMENT
    // ===============================================
    function handleInventarisForm(e) {
        e.preventDefault();
        const nama = document.getElementById("namaItem").value.trim();
        const jumlah = parseFloat(document.getElementById("jumlahItem").value);
        const satuan = document.getElementById("satuanItem").value.trim();
        const supplier = document.getElementById("supplierItem").value.trim();

        if (!nama || isNaN(jumlah) || !satuan) {
            return alert("Semua field harus diisi dengan benar.");
        }

        performDBAction("inventaris", "readwrite", "get", nama, (existingItem) => {
            let finalJumlah = jumlah;
            if (existingItem) {
                finalJumlah += existingItem.jumlah;
            }
            const dataToStore = { nama, jumlah: finalJumlah, satuan, supplier };
            performDBAction("inventaris", "readwrite", "put", dataToStore, () => {
                // Simpan riwayat stok masuk
                const riwayatData = {
                    nama: nama,
                    jenis: 'masuk',
                    jumlah: jumlah,
                    satuan: satuan,
                    supplier: supplier,
                    catatan: 'Stok masuk',
                    tanggal: new Date().toLocaleString('id-ID')
                };
                performDBAction("riwayatStok", "readwrite", "add", riwayatData, () => {
                    showToast(`Stok "${nama}" berhasil diperbarui.`);
                    e.target.reset();
                    renderInventarisTable();
                });
            });
        });
    }

    window.deleteItemInventaris = function(nama) {
        if (confirm(`Yakin ingin menghapus item "${nama}" dari inventaris?`)) {
            performDBAction("inventaris", "readwrite", "delete", nama, () => renderInventarisTable());
        }
    }
    
    window.keluarStok = function(nama) {
        performDBAction("inventaris", "readonly", "get", nama, (item) => {
            if (!item) return;
            
            document.getElementById('stok-keluar-namaItem').value = nama;
            document.getElementById('stok-keluar-namaItem-display').value = nama;
            document.getElementById('stok-keluar-modal').style.display = 'flex';
        });
    }
    
    function handleStokKeluarForm(e) {
        e.preventDefault();
        const nama = document.getElementById('stok-keluar-namaItem').value;
        const jumlah = parseFloat(document.getElementById('stok-keluar-jumlah').value);
        const catatan = document.getElementById('stok-keluar-catatan').value.trim();
        
        if (!nama || isNaN(jumlah) || jumlah <= 0) {
            return alert("Jumlah stok keluar harus valid.");
        }
        
        performDBAction("inventaris", "readwrite", "get", nama, (existingItem) => {
            if (!existingItem) return;
            
            if (existingItem.jumlah < jumlah) {
                return alert(`Jumlah stok keluar melebihi stok yang tersedia (${existingItem.jumlah} ${existingItem.satuan}).`);
            }
            
            const finalJumlah = existingItem.jumlah - jumlah;
            const dataToStore = { 
                nama: existingItem.nama, 
                jumlah: finalJumlah, 
                satuan: existingItem.satuan,
                supplier: existingItem.supplier || ''
            };
            
            performDBAction("inventaris", "readwrite", "put", dataToStore, () => {
                // Simpan riwayat stok keluar
                const riwayatData = {
                    nama: nama,
                    jenis: 'keluar',
                    jumlah: jumlah,
                    satuan: existingItem.satuan,
                    catatan: catatan || 'Stok keluar',
                    tanggal: new Date().toLocaleString('id-ID')
                };
                performDBAction("riwayatStok", "readwrite", "add", riwayatData, () => {
                    showToast(`Stok "${nama}" berhasil dikurangi.`);
                    document.getElementById('stok-keluar-form').reset();
                    document.getElementById('stok-keluar-modal').style.display = 'none';
                    renderInventarisTable();
                });
            });
        });
    }
    
    window.riwayatStok = function(nama) {
        performDBAction("riwayatStok", "readonly", "getAll", null, (allRiwayat) => {
            const riwayatItem = allRiwayat.filter(r => r.nama === nama);
            const container = document.getElementById('riwayat-stok-container');
            const title = document.getElementById('riwayat-stok-title');
            
            title.textContent = `Riwayat Stok: ${nama}`;
            container.innerHTML = '';
            
            if (riwayatItem.length === 0) {
                container.innerHTML = '<p>Tidak ada riwayat stok untuk item ini.</p>';
            } else {
                let tableHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>Jenis</th>
                                <th>Jumlah</th>
                                <th>Catatan</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                riwayatItem.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)).forEach(item => {
                    tableHTML += `
                        <tr>
                            <td>${item.tanggal}</td>
                            <td class="${item.jenis === 'masuk' ? 'stock-in' : 'stock-out'}">${item.jenis === 'masuk' ? 'Masuk' : 'Keluar'}</td>
                            <td>${item.jumlah} ${item.satuan}</td>
                            <td>${item.catatan || '-'}</td>
                        </tr>
                    `;
                });
                
                tableHTML += '</tbody></table>';
                container.innerHTML = tableHTML;
            }
            
            document.getElementById('riwayat-stok-modal').style.display = 'flex';
        });
    }
    
    // ===============================================
    // PRODUK MANAGEMENT
    // ===============================================
    function handleProdukForm(e) {
        e.preventDefault();
        const nama = document.getElementById("namaProduk").value.trim();
        const kategori = document.getElementById("kategoriProduk").value;
        const hpp = parseFloat(document.getElementById("hppProduk").value);
        const hargaJual = parseFloat(document.getElementById("hargaJualProduk").value);
        
        if (!nama || isNaN(hargaJual) || hargaJual <= 0) {
            return alert("Nama produk dan harga harus valid.");
        }
        
        performDBAction("produk", "readwrite", "put", { nama, kategori, hpp, hargaJual }, () => {
            showToast(`Produk "${nama}" berhasil disimpan.`);
            e.target.reset();
            renderProdukTable();
            loadProdukForKasirList();
        });
    }

    window.deleteProduk = function(nama) {
        if (confirm(`Yakin ingin menghapus produk "${nama}"?`)) {
            performDBAction("produk", "readwrite", "delete", nama, () => {
                renderProdukTable();
                loadProdukForKasirList();
            });
        }
    }
    
    window.editProduk = function(nama) {
        performDBAction("produk", "readonly", "get", nama, (produk) => {
            if (!produk) return;
            
            document.getElementById('edit-namaProduk-original').value = produk.nama;
            document.getElementById('edit-namaProduk').value = produk.nama;
            document.getElementById('edit-kategoriProduk').value = produk.kategori || 'lainnya';
            document.getElementById('edit-hppProduk').value = produk.hpp || 0;
            document.getElementById('edit-hargaJualProduk').value = produk.hargaJual;
            
            document.getElementById('edit-produk-modal').style.display = 'flex';
        });
    }
    
    function handleEditProdukForm(e) {
        e.preventDefault();
        const namaAsli = document.getElementById('edit-namaProduk-original').value;
        const nama = document.getElementById('edit-namaProduk').value.trim();
        const kategori = document.getElementById('edit-kategoriProduk').value;
        const hpp = parseFloat(document.getElementById('edit-hppProduk').value);
        const hargaJual = parseFloat(document.getElementById('edit-hargaJualProduk').value);
        
        if (!nama || isNaN(hargaJual) || hargaJual <= 0) {
            return alert("Nama produk dan harga harus valid.");
        }
        
        // Hapus produk lama jika nama berubah
        if (namaAsli !== nama) {
            performDBAction("produk", "readwrite", "delete", namaAsli, () => {
                // Tambahkan produk baru dengan nama yang diperbarui
                performDBAction("produk", "readwrite", "put", { nama, kategori, hpp, hargaJual }, () => {
                    showToast(`Produk "${namaAsli}" berhasil diubah menjadi "${nama}".`);
                    document.getElementById('edit-produk-modal').style.display = 'none';
                    renderProdukTable();
                    loadProdukForKasirList();
                });
            });
        } else {
            // Jika nama tidak berubah, cukup update
            performDBAction("produk", "readwrite", "put", { nama, kategori, hpp, hargaJual }, () => {
                showToast(`Produk "${nama}" berhasil diperbarui.`);
                document.getElementById('edit-produk-modal').style.display = 'none';
                renderProdukTable();
                loadProdukForKasirList();
            });
        }
    }

    // ===============================================
    // PENGATURAN MANAGEMENT
    // ===============================================
    function handlePengaturanForm(e) {
        e.preventDefault();
        const namaToko = document.getElementById("namaToko").value.trim();
        const alamatToko = document.getElementById("alamatToko").value.trim();
        const teleponToko = document.getElementById("teleponToko").value.trim();
        
        if (!namaToko) {
            return alert("Nama toko harus diisi.");
        }
        
        performDBAction("pengaturan", "readwrite", "put", { id: "toko", namaToko, alamatToko, teleponToko }, () => {
            showToast("Pengaturan toko berhasil disimpan.");
        });
    }
    
    function loadPengaturan() {
        performDBAction("pengaturan", "readonly", "get", "toko", (pengaturan) => {
            if (pengaturan) {
                document.getElementById("namaToko").value = pengaturan.namaToko || "";
                document.getElementById("alamatToko").value = pengaturan.alamatToko || "";
                document.getElementById("teleponToko").value = pengaturan.teleponToko || "";
            }
        });
    }

    // ===============================================
    // KASIR & TRANSAKSI
    // ===============================================
    function loadProdukForKasirList(query = '') {
        performDBAction("produk", "readonly", "getAll", null, (allProduk) => {
            produkListCache = allProduk;
            const container = document.getElementById('produk-list-kasir');
            container.innerHTML = '';
            
            // Filter berdasarkan kategori dan pencarian
            const filtered = allProduk.filter(p => {
                const matchesKategori = currentKategori === 'semua' || p.kategori === currentKategori;
                const matchesSearch = p.nama.toLowerCase().includes(query.toLowerCase());
                return matchesKategori && matchesSearch;
            });
            
            if(filtered.length === 0) {
                container.innerHTML = '<p class="text-center">Produk tidak ditemukan.</p>';
                return;
            }
            
            filtered.forEach(p => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'produk-item';
                itemDiv.innerHTML = `<h4>${p.nama}</h4><div class="price">Rp ${p.hargaJual.toLocaleString('id-ID')}</div>`;
                itemDiv.onclick = () => addToCart(p);
                container.appendChild(itemDiv);
            });
        });
    }
    
    function addToCart(produk) {
        const existingItemIndex = cart.findIndex(item => item.nama === produk.nama);
        
        if (existingItemIndex > -1) {
            cart[existingItemIndex].qty += 1;
        } else {
            cart.push({ 
                nama: produk.nama, 
                hargaJual: produk.hargaJual, 
                qty: 1 
            });
        }
        
        updateCart();
        showToast(`${produk.nama} ditambahkan ke keranjang`);
    }
    
    window.updateQty = function(index, newQty) {
        if (newQty <= 0) return deleteItem(index);
        cart[index].qty = newQty;
        updateCart();
    }
    
    window.deleteItem = function(index) {
        const productName = cart[index].nama;
        cart.splice(index, 1);
        updateCart();
        showToast(`${productName} dihapus dari keranjang`);
    }
    
    function updateCart() {
        const container = document.getElementById('cart-items-container');
        container.innerHTML = "";
        
        if (cart.length === 0) {
            container.innerHTML = '<p class="text-center">Keranjang kosong</p>';
            updateCartSummary();
            return;
        }
        
        cart.forEach((item, index) => {
            const total = item.hargaJual * item.qty;
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item';
            itemElement.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nama}</div>
                    <div class="cart-item-price">Rp ${item.hargaJual.toLocaleString('id-ID')} x ${item.qty}</div>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQty(${index}, ${item.qty - 1})">-</button>
                    <span class="qty-display">${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty(${index}, ${item.qty + 1})">+</button>
                    <button class="delete-btn" onclick="deleteItem(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(itemElement);
        });
        
        updateCartSummary();
    }
    
    function updateCartSummary() {
        const subtotal = cart.reduce((acc, item) => acc + (item.hargaJual * item.qty), 0);
        const pajak = pajakPersen > 0 ? (subtotal * pajakPersen / 100) : 0;
        const total = subtotal + pajak;
        
        document.getElementById("subtotal").textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
        document.getElementById("pajak-value").textContent = `Rp ${pajak.toLocaleString('id-ID')}`;
        document.getElementById("total").textContent = `Rp ${total.toLocaleString('id-ID')}`;
        
        calculateChange();
    }
    
    function calculateChange() {
        const totalElement = document.getElementById("total");
        const total = parseFloat(totalElement.textContent.replace('Rp', '').replace(/\./g, '')) || 0;
        const jumlahBayar = parseFloat(document.getElementById("jumlahBayar").value) || 0;
        const kembalian = jumlahBayar - total;
        const uangKembaliInput = document.getElementById("uangKembali");

        if (jumlahBayar === 0) {
            uangKembaliInput.value = '';
        } else if (kembalian >= 0) {
            uangKembaliInput.value = `Rp ${kembalian.toLocaleString('id-ID')}`;
        } else {
            uangKembaliInput.value = `Kurang Rp ${Math.abs(kembalian).toLocaleString('id-ID')}`;
        }
    }

    function handleQuickCash(e) {
        if (e.target.classList.contains('quick-cash-btn')) {
            const value = parseFloat(e.target.dataset.value);
            const bayarInput = document.getElementById('jumlahBayar');
            const currentValue = parseFloat(bayarInput.value) || 0;
            const totalElement = document.getElementById("total");
            const total = parseFloat(totalElement.textContent.replace('Rp', '').replace(/\./g, '')) || 0;
            
            // If input is empty or less than total, set to button value, otherwise add
            if (currentValue < total) {
                bayarInput.value = value;
            } else {
                bayarInput.value = currentValue + value;
            }
            
            calculateChange();
        }
    }

    function batalTransaksi() {
        if (confirm("Yakin ingin membatalkan transaksi ini?")) {
            cart = [];
            document.getElementById("jumlahBayar").value = '';
            updateCart();
        }
    }

    function simpanTransaksi() {
        if (cart.length === 0) return alert("Keranjang masih kosong!");
        
        const subtotal = cart.reduce((acc, item) => acc + (item.hargaJual * item.qty), 0);
        const pajak = pajakPersen > 0 ? (subtotal * pajakPersen / 100) : 0;
        const totalTransaksi = subtotal + pajak;
        const jumlahBayar = parseFloat(document.getElementById("jumlahBayar").value) || 0;
        const paymentMethod = document.getElementById("payment-method").value;
        
        if (paymentMethod === 'TUNAI' && jumlahBayar < totalTransaksi) {
            return alert("Jumlah pembayaran tunai tidak mencukupi!");
        }

        const transaksiRecord = {
            id: `trx-${Date.now()}`,
            waktu: new Date().toLocaleString('id-ID'),
            items: cart,
            metode: paymentMethod,
            subtotal: subtotal,
            pajak: pajak,
            total: totalTransaksi,
            bayar: jumlahBayar,
            kembali: jumlahBayar - totalTransaksi
        };

        performDBAction("transaksi", "readwrite", "put", transaksiRecord, () => {
            cetakStruk(transaksiRecord);
            batalTransaksi();
            generateReport();
        });
    }
    
    function cetakStruk(transaksi) {
        // Get pengaturan toko untuk struk
        performDBAction("pengaturan", "readonly", "get", "toko", (pengaturan) => {
            const namaToko = pengaturan?.namaToko || "Toko Saya";
            const alamatToko = pengaturan?.alamatToko || "";
            const teleponToko = pengaturan?.teleponToko || "";
            
            let receiptContent = `
                <div class="receipt-header">
                    <h3>${namaToko}</h3>
                    ${alamatToko ? `<p>${alamatToko}</p>` : ''}
                    ${teleponToko ? `<p>${teleponToko}</p>` : ''}
                    <p>${transaksi.waktu}</p>
                    <p>No: ${transaksi.id}</p>
                </div>
                <table class="receipt-items">
                    <thead>
                        <tr>
                            <th class="item">Item</th>
                            <th class="total">Total</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            transaksi.items.forEach(i => {
                receiptContent += `
                    <tr>
                        <td class="item">${i.nama}<br><small>${i.qty} x @${i.hargaJual.toLocaleString('id-ID')}</small></td>
                        <td class="total">${(i.qty * i.hargaJual).toLocaleString('id-ID')}</td>
                    </tr>`;
            });
            
            receiptContent += `</tbody><tfoot>`;
            
            if (transaksi.pajak > 0) {
                receiptContent += `
                    <tr>
                        <td class="item">Subtotal</td>
                        <td class="total">${transaksi.subtotal.toLocaleString('id-ID')}</td>
                    </tr>
                    <tr>
                        <td class="item">Pajak (${pajakPersen}%)</td>
                        <td class="total">${transaksi.pajak.toLocaleString('id-ID')}</td>
                    </tr>`;
            }
            
            receiptContent += `
                <tr>
                    <th class="item">TOTAL</th>
                    <th class="total">${transaksi.total.toLocaleString('id-ID')}</th>
                </tr>
                <tr>
                    <td class="item">METODE</td>
                    <td class="total">${transaksi.metode}</td>
                </tr>
                <tr>
                    <td class="item">BAYAR</td>
                    <td class="total">${transaksi.bayar.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                    <td class="item">KEMBALI</td>
                    <td class="total">${transaksi.kembali.toLocaleString('id-ID')}</td>
                </tr>
                </tfoot>
            </table>
            <div class="receipt-footer">
                <p>Terima Kasih!</p>
            </div>`;

            const printWindow = window.open('', 'PRINT', 'height=600,width=300');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Struk</title>
                        <link rel="stylesheet" href="print.css">
                    </head>
                    <body>${receiptContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        });
    }
    
    window.deleteTransaksi = function(id) {
        if(confirm(`Yakin hapus transaksi ${id}? Tindakan ini tidak dapat dibatalkan.`)) {
            performDBAction("transaksi", "readwrite", "delete", id, () => generateReport());
        }
    }

    // ===============================================
    // TABLE RENDERING & PAGINATION
    // ===============================================
    const renderFunctions = {
        produk: renderProdukTable,
        inventaris: renderInventarisTable,
        laporan: generateReport,
    };

    function handleItemsPerPageChange(module, value) {
        if (value === 'custom') {
            const customValue = parseInt(prompt('Masukkan jumlah item per halaman:'), 10);
            if (!isNaN(customValue) && customValue > 0) {
                state[module].itemsPerPage = customValue;
            }
        } else {
            state[module].itemsPerPage = parseInt(value, 10);
        }
        renderFunctions[module](1);
    }

    function renderTable(module, allData, renderRowFunc) {
        state[module].currentPage = state[module].currentPage || 1;
        const { currentPage, itemsPerPage, searchQuery } = state[module];
        
        const filteredData = allData.filter(item => {
            if (!searchQuery) return true;
            return Object.values(item).some(val => 
                String(val).toLowerCase().includes(searchQuery.toLowerCase())
            );
        }).reverse();

        const tbody = document.querySelector(`#tabel-${module} tbody, #report-table tbody`);
        if (!tbody) return;
        
        tbody.innerHTML = "";
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);
        
        paginatedData.forEach(item => {
            tbody.innerHTML += renderRowFunc(item);
        });
        
        const paginationContainerId = module === 'laporan' ? 'laporan-pagination' : `${module}-pagination`;
        renderPaginationControls(paginationContainerId, filteredData.length, currentPage, renderFunctions[module]);
    }

    function renderProdukTable(page = state.produk.currentPage) {
        state.produk.currentPage = page;
        performDBAction("produk", "readonly", "getAll", null, (data) => {
            renderTable('produk', data, item => `
                <tr>
                    <td>${item.nama}</td>
                    <td>${item.kategori || 'lainnya'}</td>
                    <td>${item.hpp ? item.hpp.toLocaleString('id-ID') : '-'}</td>
                    <td>${item.hargaJual.toLocaleString('id-ID')}</td>
                    <td class="action-btn-group">
                        <button class="action-btn edit" onclick="editProduk('${item.nama}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteProduk('${item.nama}')"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `);
        });
    }

    function renderInventarisTable(page = state.inventaris.currentPage) {
        state.inventaris.currentPage = page;
        performDBAction("inventaris", "readonly", "getAll", null, (data) => {
            renderTable('inventaris', data, item => `
                <tr>
                    <td>${item.nama}</td>
                    <td>${item.jumlah}</td>
                    <td>${item.satuan || ''}</td>
                    <td class="action-btn-group">
                        <button class="action-btn stock-out" onclick="keluarStok('${item.nama}')"><i class="fas fa-minus-circle"></i></button>
                        <button class="action-btn history" onclick="riwayatStok('${item.nama}')"><i class="fas fa-history"></i></button>
                        <button class="action-btn delete" onclick="deleteItemInventaris('${item.nama}')"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `);
        });
    }

    function generateReport(page = state.laporan.currentPage) {
        state.laporan.currentPage = page;
        const filterDate = document.getElementById("filterDate");
        const filterDateValue = filterDate ? filterDate.value : '';
        
        performDBAction("transaksi", "readonly", "getAll", null, (data) => {
            const filteredByDate = data.filter(r => {
                if (!filterDateValue) return true;
                const tgl = new Date(r.waktu.split(',')[0].split('/').reverse().join('-'));
                return tgl.toISOString().slice(0, 10) === filterDateValue;
            });
            
            const totalPenjualan = filteredByDate.reduce((sum, t) => sum + t.total, 0);
            const reportSummary = document.getElementById("report-summary");
            
            if (reportSummary) {
                reportSummary.innerHTML = `
                    <p>Total Transaksi: ${filteredByDate.length}</p>
                    <p>Total Penjualan: Rp ${totalPenjualan.toLocaleString('id-ID')}</p>
                `;
            }

            renderTable('laporan', filteredByDate, transaksi => {
                const itemsHtml = transaksi.items.map(i => `${i.nama}(${i.qty})`).join(', ');
                return `
                    <tr>
                        <td>${transaksi.waktu}</td>
                        <td>${transaksi.id}</td>
                        <td>${itemsHtml}</td>
                        <td>${transaksi.metode}</td>
                        <td>${transaksi.total.toLocaleString('id-ID')}</td>
                        <td class="action-btn-group">
                            <button class="action-btn delete" onclick="deleteTransaksi('${transaksi.id}')"><i class="fas fa-trash-alt"></i></button>
                        </td>
                    </tr>
                `;
            });
        });
    }
    
    function renderPaginationControls(containerId, totalItems, currentPage, renderFunc) {
        const container = document.getElementById(containerId);
        if(!container) return;
        
        container.innerHTML = '';
        const itemsPerPage = state[containerId.split('-')[0]].itemsPerPage;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.innerText = i;
            pageButton.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
            pageButton.onclick = () => renderFunc(i);
            container.appendChild(pageButton);
        }
    }
    
    // ===============================================
    // PDF EXPORT
    // ===============================================
    function exportToPDF(module) {
        const doc = new jsPDF();
        let title, head, bodyData;

        const storeNameMap = {
            produk: 'produk',
            inventaris: 'inventaris',
            laporan: 'transaksi'
        };

        const storeName = storeNameMap[module];
        if (!storeName) return;

        performDBAction(storeName, "readonly", "getAll", null, (allData) => {
            if (!allData || allData.length === 0) {
                return alert(`Tidak ada data untuk diekspor pada modul ${module}.`);
            }

            switch(module) {
                case 'produk':
                    title = "Laporan Daftar Produk";
                    head = [['Nama Produk', 'Kategori', 'HPP (Rp)', 'Harga Jual (Rp)']];
                    bodyData = allData.map(p => [
                        p.nama, 
                        p.kategori || 'lainnya', 
                        p.hpp ? p.hpp.toLocaleString('id-ID') : '-', 
                        p.hargaJual.toLocaleString('id-ID')
                    ]);
                    break;
                case 'inventaris':
                    title = "Laporan Stok Inventaris";
                    head = [['Nama Item', 'Sisa Stok', 'Satuan']];
                    bodyData = allData.map(i => [i.nama, i.jumlah, i.satuan]);
                    break;
                case 'laporan':
                    title = "Laporan Penjualan";
                    head = [['Waktu', 'ID Transaksi', 'Items', 'Metode', 'Total (Rp)']];
                    bodyData = allData.map(t => [
                        t.waktu,
                        t.id,
                        t.items.map(i => `${i.nama}(${i.qty})`).join(', '),
                        t.metode,
                        t.total.toLocaleString('id-ID')
                    ]);
                    break;
            }

            doc.text(title, 14, 16);
            doc.autoTable({
                head: head,
                body: bodyData,
                startY: 20,
                theme: 'grid',
                headStyles: { fillColor: [13, 110, 253] }
            });

            doc.save(`laporan_${module}_${new Date().toISOString().slice(0,10)}.pdf`);
        });
    }
    
    // ===============================================
    // UTILITY FUNCTIONS
    // ===============================================
    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});