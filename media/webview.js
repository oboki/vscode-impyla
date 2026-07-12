(function() {
  const vscode = acquireVsCodeApi();

  const views = {
    welcome: document.getElementById('welcome-view'),
    loading: document.getElementById('loading-view'),
    error: document.getElementById('error-view'),
    results: document.getElementById('results-view'),
  };

  const loadingMessage = document.getElementById('loading-message');
  const errorTypeBadge = document.getElementById('error-type-badge');
  const errorLineBadge = document.getElementById('error-line-badge');
  const errorMessage = document.getElementById('error-message');
  const copyErrorButton = document.getElementById('copy-error-button');

  const summaryRowCount = document.getElementById('summary-row-count');
  const summaryExecutionTime = document.getElementById('summary-execution-time');
  const summaryColumnCount = document.getElementById('summary-column-count');
  const warningBanner = document.getElementById('warning-banner');
  const renderedSqlSection = document.getElementById('rendered-sql-section');
  const renderedSqlSubtitle = document.getElementById('rendered-sql-subtitle');
  const renderedSqlPre = document.getElementById('rendered-sql-pre');
  const renderedSqlCode = document.getElementById('rendered-sql-code');
  const copySqlButton = document.getElementById('copy-sql-button');
  const toggleWrapButton = document.getElementById('toggle-wrap-button');

  const searchInput = document.getElementById('result-search');
  const pageSizeSelect = document.getElementById('page-size-select');
  const resultsMeta = document.getElementById('results-meta');
  const resultsHead = document.getElementById('results-head');
  const resultsBody = document.getElementById('results-body');
  const emptyState = document.getElementById('empty-state');
  const paginationStatus = document.getElementById('pagination-status');
  const previousPageButton = document.getElementById('previous-page-button');
  const nextPageButton = document.getElementById('next-page-button');
  const copyPageButton = document.getElementById('copy-page-button');
  const exportCsvButton = document.getElementById('export-csv-button');
  const exportJsonButton = document.getElementById('export-json-button');

  const state = {
    filterText: '',
    sortColumn: -1,
    sortDirection: 'asc',
    currentPage: 1,
    pageSize: 200,
    result: null,
    columnNamesSearchText: '',
  };

  function showView(kind) {
    views.welcome.hidden = kind !== 'welcome';
    views.loading.hidden = kind !== 'loading';
    views.error.hidden = kind !== 'error';
    views.results.hidden = kind !== 'results';
  }

  function formatCellValue(value) {
    return value === null || value === undefined ? 'NULL' : String(value);
  }

  function isNumeric(value) {
    return typeof value === 'number';
  }

  function resetTransientState() {
    state.filterText = '';
    state.sortColumn = -1;
    state.sortDirection = 'asc';
    state.currentPage = 1;
    state.result = null;
    state.columnNamesSearchText = '';
    searchInput.value = '';
    pageSizeSelect.value = String(state.pageSize);
  }

  function buildSearchTarget(row) {
    const rowText = row.map((cell) => formatCellValue(cell).toLowerCase()).join(' ');
    return state.columnNamesSearchText + ' ' + rowText;
  }

  function compareValues(left, right) {
    const leftNull = left === null || left === undefined;
    const rightNull = right === null || right === undefined;

    if (leftNull && rightNull) {
      return 0;
    }
    if (leftNull) {
      return 1;
    }
    if (rightNull) {
      return -1;
    }

    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }

    return String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  function getFilteredRows() {
    if (!state.result) {
      return [];
    }

    if (!state.filterText) {
      return state.result.rows.map((row, index) => ({ row, sourceIndex: index }));
    }

    return state.result.rows
      .map((row, index) => ({ row, sourceIndex: index }))
      .filter(({ row }) => buildSearchTarget(row).includes(state.filterText));
  }

  function getProcessedRows() {
    const rows = getFilteredRows();

    if (state.sortColumn >= 0) {
      rows.sort((left, right) => {
        const comparison = compareValues(
          left.row[state.sortColumn],
          right.row[state.sortColumn],
        );
        return state.sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return rows;
  }

  function getPageSlice(processedRows) {
    if (state.pageSize === -1) {
      return {
        startIndex: 0,
        endIndex: processedRows.length,
        rows: processedRows,
        totalPages: 1,
      };
    }

    const totalPages = Math.max(1, Math.ceil(processedRows.length / state.pageSize));
    state.currentPage = Math.min(state.currentPage, totalPages);
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, processedRows.length);

    return {
      startIndex,
      endIndex,
      rows: processedRows.slice(startIndex, endIndex),
      totalPages,
    };
  }

  function serializeDelimited(rows, delimiter) {
    const columns = state.result ? state.result.columns : [];
    const header = ['#'].concat(columns).join(delimiter);
    const body = rows.map(({ row }, rowIndex) => {
      const values = [String(rowIndex + 1)].concat(
        row.map((cell) => {
          const value = formatCellValue(cell);
          if (
            value.includes('"') ||
            value.includes('\n') ||
            value.includes('\r') ||
            value.includes(delimiter)
          ) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          return value;
        }),
      );
      return values.join(delimiter);
    });
    return [header].concat(body).join('\n');
  }

  function serializeJson(rows) {
    const columns = state.result ? state.result.columns : [];
    return JSON.stringify(
      rows.map(({ row }, rowIndex) => {
        const record = { __rowNumber: rowIndex + 1 };
        columns.forEach((column, index) => {
          record[column] = row[index] ?? null;
        });
        return record;
      }),
      null,
      2,
    );
  }

  function updateHeader() {
    const columns = state.result ? state.result.columns : [];
    const headerRow = document.createElement('tr');
    const rowNumberHeader = document.createElement('th');
    rowNumberHeader.scope = 'col';
    rowNumberHeader.className = 'row-number-header';
    rowNumberHeader.textContent = '#';
    headerRow.appendChild(rowNumberHeader);

    columns.forEach((column, index) => {
      const th = document.createElement('th');
      th.scope = 'col';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'column-sort-button';
      button.dataset.columnIndex = String(index);

      const label = document.createElement('span');
      label.textContent = column;
      button.appendChild(label);

      const indicator = document.createElement('span');
      indicator.className = 'sort-indicator';
      indicator.textContent = state.sortColumn === index
        ? state.sortDirection === 'asc'
          ? '▲'
          : '▼'
        : '↕';
      button.appendChild(indicator);

      th.appendChild(button);
      headerRow.appendChild(th);
    });

    resultsHead.replaceChildren(headerRow);
  }

  function renderTable() {
    if (!state.result) {
      return;
    }

    const processedRows = getProcessedRows();
    const page = getPageSlice(processedRows);
    const tableFragment = document.createDocumentFragment();

    page.rows.forEach(({ row }, index) => {
      const tr = document.createElement('tr');
      const rowNumber = document.createElement('td');
      rowNumber.className = 'row-number-cell';
      rowNumber.textContent = String(page.startIndex + index + 1);
      tr.appendChild(rowNumber);

      row.forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = formatCellValue(cell);

        if (cell === null || cell === undefined) {
          td.classList.add('null-cell');
        } else if (isNumeric(cell)) {
          td.classList.add('numeric-cell');
        }

        td.title = formatCellValue(cell);
        tr.appendChild(td);
      });

      tableFragment.appendChild(tr);
    });

    resultsBody.replaceChildren(tableFragment);
    emptyState.hidden = processedRows.length > 0;

    const visibleStart = processedRows.length === 0 ? 0 : page.startIndex + 1;
    const visibleEnd = page.endIndex;
    const filteredCount = processedRows.length;
    const fetchedCount = state.result.rows.length;
    const sortedBy = state.sortColumn >= 0
      ? ' • Sorted by ' + state.result.columns[state.sortColumn] + ' (' + state.sortDirection + ')'
      : '';

    resultsMeta.textContent =
      'Showing ' + visibleStart.toLocaleString() + '-' + visibleEnd.toLocaleString() +
      ' of ' + filteredCount.toLocaleString() + ' filtered row(s) from ' + fetchedCount.toLocaleString() + ' fetched row(s)' +
      sortedBy;

    paginationStatus.textContent =
      state.pageSize === -1
        ? 'All fetched rows shown'
        : 'Page ' + state.currentPage + ' of ' + page.totalPages;
    previousPageButton.disabled = state.pageSize === -1 || state.currentPage <= 1;
    nextPageButton.disabled = state.pageSize === -1 || state.currentPage >= page.totalPages;
    copyPageButton.disabled = page.rows.length === 0;
    exportCsvButton.disabled = filteredCount === 0;
    exportJsonButton.disabled = filteredCount === 0;

    updateHeader();
  }

  function renderResults(result) {
    state.result = result;
    state.columnNamesSearchText = result.columns.join(' ').toLowerCase();
    summaryRowCount.textContent = result.rowCount.toLocaleString();
    summaryExecutionTime.textContent = result.executionTimeMs + 'ms';
    summaryColumnCount.textContent = result.columns.length.toLocaleString();

    if (result.hasMore) {
      warningBanner.hidden = false;
      warningBanner.innerHTML =
        'Result set was truncated at ' + result.rowCount.toLocaleString() + ' rows. Narrow the query or increase <code>impyla.maxRows</code> if you need more data.';
    } else {
      warningBanner.hidden = true;
      warningBanner.textContent = '';
    }

    renderedSqlPre.classList.remove('is-wrapped');
    toggleWrapButton.textContent = 'Wrap lines';
    toggleWrapButton.setAttribute('aria-pressed', 'false');

    if (result.renderedSql) {
      const lineCount = result.renderedSql.split(/\r?\n/).length;
      renderedSqlSection.hidden = false;
      renderedSqlSubtitle.textContent =
        'Expanded by default for templated queries. ' + lineCount + ' line' + (lineCount === 1 ? '.' : 's.');
      renderedSqlCode.textContent = result.renderedSql;
    } else {
      renderedSqlSection.hidden = true;
      renderedSqlSubtitle.textContent = '';
      renderedSqlCode.textContent = '';
    }

    renderTable();
  }

  function applyState(nextState) {
    switch (nextState.kind) {
      case 'welcome':
        resetTransientState();
        showView('welcome');
        break;
      case 'loading':
        showView('loading');
        loadingMessage.textContent = nextState.message;
        break;
      case 'error':
        showView('error');
        errorMessage.textContent = nextState.error;

        if (nextState.errorType) {
          errorTypeBadge.hidden = false;
          errorTypeBadge.textContent = nextState.errorType;
        } else {
          errorTypeBadge.hidden = true;
          errorTypeBadge.textContent = '';
        }

        if (typeof nextState.line === 'number') {
          errorLineBadge.hidden = false;
          errorLineBadge.textContent = 'Line ' + nextState.line;
        } else {
          errorLineBadge.hidden = true;
          errorLineBadge.textContent = '';
        }
        break;
      case 'results':
        showView('results');
        renderResults(nextState.result);
        break;
    }
  }

  resultsHead.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest('.column-sort-button');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const columnIndex = Number(button.dataset.columnIndex);
    if (Number.isNaN(columnIndex)) {
      return;
    }

    if (state.sortColumn === columnIndex) {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortColumn = columnIndex;
      state.sortDirection = 'asc';
    }

    state.currentPage = 1;
    renderTable();
  });

  searchInput.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    state.filterText = target.value.trim().toLowerCase();
    state.currentPage = 1;
    renderTable();
  });

  pageSizeSelect.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    state.pageSize = Number(target.value);
    state.currentPage = 1;
    renderTable();
  });

  previousPageButton.addEventListener('click', () => {
    state.currentPage = Math.max(1, state.currentPage - 1);
    renderTable();
  });

  nextPageButton.addEventListener('click', () => {
    state.currentPage += 1;
    renderTable();
  });

  copyPageButton.addEventListener('click', () => {
    const page = getPageSlice(getProcessedRows());
    vscode.postMessage({
      type: 'copyToClipboard',
      content: serializeDelimited(page.rows, '\t'),
      label: 'Copied current page as TSV',
    });
  });

  exportCsvButton.addEventListener('click', () => {
    const rows = getProcessedRows();
    vscode.postMessage({
      type: 'exportData',
      format: 'csv',
      content: serializeDelimited(rows, ','),
      defaultFileName: 'impyla-results.csv',
    });
  });

  exportJsonButton.addEventListener('click', () => {
    const rows = getProcessedRows();
    vscode.postMessage({
      type: 'exportData',
      format: 'json',
      content: serializeJson(rows),
      defaultFileName: 'impyla-results.json',
    });
  });

  copyErrorButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'copyToClipboard',
      content: errorMessage.textContent || '',
      label: 'Copied error details',
    });
  });

  copySqlButton.addEventListener('click', () => {
    if (!state.result?.renderedSql) {
      return;
    }

    vscode.postMessage({
      type: 'copyToClipboard',
      content: state.result.renderedSql,
      label: 'Copied rendered SQL',
    });
  });

  toggleWrapButton.addEventListener('click', () => {
    renderedSqlPre.classList.toggle('is-wrapped');
    const wrapped = renderedSqlPre.classList.contains('is-wrapped');
    toggleWrapButton.textContent = wrapped ? 'Disable wrap' : 'Wrap lines';
    toggleWrapButton.setAttribute('aria-pressed', wrapped ? 'true' : 'false');
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.type !== 'updateState') {
      return;
    }

    applyState(message.state);
  });

  vscode.postMessage({ type: 'webviewReady' });
})();