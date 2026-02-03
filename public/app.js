const API_URL = window.location.origin;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(target).classList.add('active');
        
        if (target === 'products') loadProducts();
        else if (target === 'providers') loadProviders();
        else if (target === 'stress') loadStressStatus();
    });
});

// Products
async function loadProducts() {
    const res = await fetch(`${API_URL}/products`);
    const products = await res.json();
    document.getElementById('products-list').innerHTML = products.map(p => `
        <div class="card">
            ${p.image_url ? `<img src="${p.image_url}" alt="${p.product_name}" style="width:100%;height:200px;object-fit:cover;border-radius:8px 8px 0 0;margin:-16px -16px 12px -16px;">` : ''}
            <h3>${p.product_name}</h3>
            <p>${p.description || ''}</p>
            <div class="price">$${p.price}</div>
            <p>Stock: ${p.remaining_sku}</p>
            <p style="font-size:12px;color:#999;">ID: ${p.product_id}</p>
            <button class="btn-delete" onclick="deleteProduct('${p.product_id}')">Delete</button>
        </div>
    `).join('');
}

function showProductForm() {
    document.getElementById('product-form').classList.remove('hidden');
}

function hideProductForm() {
    document.getElementById('product-form').classList.add('hidden');
    document.querySelectorAll('#product-form input, #product-form textarea').forEach(i => i.value = '');
}

async function createProduct() {
    const formData = new FormData();
    formData.append('product_id', document.getElementById('product_id').value);
    formData.append('product_name', document.getElementById('product_name').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('price', document.getElementById('price').value);
    formData.append('remaining_sku', document.getElementById('remaining_sku').value);
    
    const imageFile = document.getElementById('image_file').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    await fetch(`${API_URL}/products`, {
        method: 'POST',
        body: formData
    });
    hideProductForm();
    loadProducts();
}

async function deleteProduct(id) {
    if (confirm('Delete this product?')) {
        await fetch(`${API_URL}/products/${id}`, {method: 'DELETE'});
        loadProducts();
    }
}

// Providers
async function loadProviders() {
    try {
        const res = await fetch(`${API_URL}/providers`);
        const providers = await res.json();
        console.log('Providers loaded:', providers);
        
        if (!Array.isArray(providers)) {
            console.error('Providers response is not an array:', providers);
            return;
        }
        
        document.getElementById('providers-list').innerHTML = providers.map(p => `
            <div class="list-item">
                <div>
                    <h3>${p.provider_name}</h3>
                    <p>${p.provider_city || ''}</p>
                    <p style="font-size:12px;color:#999;">ID: ${p.provider_id}</p>
                </div>
                <button class="btn-delete" onclick="deleteProvider('${p.provider_id}')">Delete</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading providers:', error);
        document.getElementById('providers-list').innerHTML = '<p style="color:red;">Error loading providers</p>';
    }
}

function showProviderForm() {
    document.getElementById('provider-form').classList.remove('hidden');
}

function hideProviderForm() {
    document.getElementById('provider-form').classList.add('hidden');
    document.querySelectorAll('#provider-form input').forEach(i => i.value = '');
}

async function createProvider() {
    try {
        const data = {
            provider_id: document.getElementById('provider_id').value,
            provider_name: document.getElementById('provider_name').value,
            provider_city: document.getElementById('provider_city').value
        };
        
        console.log('Creating provider:', data);
        
        const res = await fetch(`${API_URL}/providers`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        console.log('Provider creation result:', result);
        
        if (!res.ok) {
            alert(`Error: ${result.error || 'Failed to create provider'}`);
            return;
        }
        
        hideProviderForm();
        loadProviders();
    } catch (error) {
        console.error('Error creating provider:', error);
        alert('Failed to create provider');
    }
}

async function deleteProvider(id) {
    if (confirm('Delete this provider?')) {
        await fetch(`${API_URL}/providers/${id}`, {method: 'DELETE'});
        loadProviders();
    }
}

// Initial load
loadProducts();

// Load instance ID
async function loadInstanceId() {
    try {
        const res = await fetch(`${API_URL}/instance-id`);
        const data = await res.json();
        document.getElementById('instance-id').textContent = `Instance: ${data.instanceId}`;
    } catch (error) {
        document.getElementById('instance-id').textContent = 'Instance: unknown';
    }
}

loadInstanceId();

// Stress Test
let stressInterval = null;
const instancesMap = new Map();

async function startStress(instanceId) {
    try {
        const res = await fetch(`${API_URL}/stress/start`, { method: 'POST' });
        const data = await res.json();
        console.log('Stress test started:', data);
        
        if (!stressInterval) {
            stressInterval = setInterval(loadAllInstances, 5000);
        }
        loadAllInstances();
    } catch (error) {
        console.error('Error starting stress test:', error);
        alert('Failed to start stress test');
    }
}

async function stopStress(instanceId) {
    try {
        const res = await fetch(`${API_URL}/stress/stop`, { method: 'POST' });
        const data = await res.json();
        console.log('Stress test stopped:', data);
        loadAllInstances();
    } catch (error) {
        console.error('Error stopping stress test:', error);
        alert('Failed to stop stress test');
    }
}

async function loadAllInstances() {
    try {
        // Make multiple requests to potentially hit different instances
        const requests = Array(10).fill(null).map(() => 
            fetch(`${API_URL}/stress/status`).then(r => r.json())
        );
        
        const results = await Promise.all(requests);
        
        // Collect unique instances
        results.forEach(data => {
            instancesMap.set(data.instanceId, data);
        });
        
        // Render table
        const tbody = document.getElementById('instances-tbody');
        if (instancesMap.size === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No instances found</td></tr>';
            return;
        }
        
        tbody.innerHTML = Array.from(instancesMap.values()).map(instance => `
            <tr>
                <td>${instance.instanceId}</td>
                <td class="${instance.running ? 'status-running' : 'status-stopped'}">
                    ${instance.running ? 'Running' : 'Stopped'}
                </td>
                <td>${instance.workers}</td>
                <td>${instance.cpu.toFixed(1)}%</td>
                <td>${instance.cores}</td>
                <td class="actions">
                    <button class="btn-small btn-start" onclick="startStress('${instance.instanceId}')">Start</button>
                    <button class="btn-small btn-stop" onclick="stopStress('${instance.instanceId}')">Stop</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading instances:', error);
    }
}

async function loadStressStatus() {
    loadAllInstances();
    if (!stressInterval) {
        stressInterval = setInterval(loadAllInstances, 5000);
    }
}

