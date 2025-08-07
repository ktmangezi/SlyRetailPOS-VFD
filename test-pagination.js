// Testing script for pagination implementation
console.log("Pagination Test Script");

// Mock API response with varying page sizes
const mockData = {
  allRecords: Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    receipt: `R000${i + 1}`,
    timestamp: new Date(),
    total: Math.random() * 1000
  })),
  
  // Simulate getting a page of data from server
  getPage(page, pageSize) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = this.allRecords.slice(startIndex, endIndex);
    
    return {
      sales: paginatedData,
      pagination: {
        totalRecords: this.allRecords.length,
        totalPages: Math.ceil(this.allRecords.length / pageSize),
        currentPage: page,
        pageSize: pageSize
      }
    };
  }
};

// Test case 1: Normal pagination without filters
console.log("\n=== Test Case 1: Server-side Pagination ===");
const pageSizes = [5, 10, 25];

pageSizes.forEach(pageSize => {
  console.log(`\nTesting with page size: ${pageSize}`);
  const totalPages = Math.ceil(mockData.allRecords.length / pageSize);
  
  console.log(`Total records: ${mockData.allRecords.length}, Total pages: ${totalPages}`);
  
  // Test getting each page
  for (let page = 1; page <= totalPages; page++) {
    const response = mockData.getPage(page, pageSize);
    console.log(`Page ${page}/${totalPages}: ${response.sales.length} records (items ${(page-1)*pageSize + 1}-${Math.min(page*pageSize, mockData.allRecords.length)})`);
  }
});

// Test case 2: Test boundary conditions
console.log("\n=== Test Case 2: Boundary Conditions ===");

// Test page 0 (should default to page 1)
let pageSize = 5;
let page = 0;
console.log(`Testing invalid page ${page} with size ${pageSize}:`);
console.log(`Expected behavior: Should default to page 1`);
let response = mockData.getPage(Math.max(1, page), pageSize);
console.log(`Got ${response.sales.length} records from page ${response.pagination.currentPage}`);

// Test page beyond max (should cap at max page)
page = 100;
console.log(`\nTesting beyond max page ${page} with size ${pageSize}:`);
console.log(`Expected behavior: Should cap at max page ${Math.ceil(mockData.allRecords.length / pageSize)}`);
const maxPage = Math.min(page, Math.ceil(mockData.allRecords.length / pageSize));
response = mockData.getPage(maxPage, pageSize);
console.log(`Got ${response.sales.length} records from page ${response.pagination.currentPage}`);

// Test case 3: Client-side filtering
console.log("\n=== Test Case 3: Client-side Filtering ===");

// Simulate a filter that returns half the records
const filteredRecords = mockData.allRecords.filter(r => r.id % 2 === 0);
console.log(`Filtered records: ${filteredRecords.length} (from original ${mockData.allRecords.length})`);

pageSize = 5;
const filteredTotalPages = Math.ceil(filteredRecords.length / pageSize);
console.log(`With page size ${pageSize}, filtered data has ${filteredTotalPages} pages`);

// Simulate pagination on filtered data
for (let page = 1; page <= filteredTotalPages; page++) {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedFiltered = filteredRecords.slice(startIndex, endIndex);
  
  console.log(`Filtered Page ${page}/${filteredTotalPages}: ${paginatedFiltered.length} records`);
}

console.log("\nPagination Test Complete");