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

  const resultsMeta = document.getElementById('results-meta');
  const resultsHead = document.getElementById('results-head');
  const resultsBody = document.getElementById('results-body');
  const emptyState = document.getElementById('empty-state');
  const loadMoreIndicator = document.getElementById('load-more-indicator');
  const copyPageButton = document.getElementById('copy-page-button');
  const exportCsvButton = document.getElementById('export-csv-button');
  const exportJsonButton = document.getElementById('export-json-button');

  const state = {
    sortColumn: -1,
    sortDirection: 'asc',
    result: null,
    loadingMore: false,
    lastLoadRequestedOffset: -1,
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
    state.sortColumn = -1;
    state.sortDirection = 'asc';
    state.result = null;
    state.loadingMore = false;
    state.lastLoadRequestedOffset = -1;
    loadMoreIndicator.hidden = true;
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

  function getProcessedRows() {
    if (!state.result) {
      return [];
    }

    const rows = state.result.rows.map((row, index) => ({ row, sourceIndex: index }));

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
    const tableFragment = document.createDocumentFragment();

    processedRows.forEach(({ row }, index) => {
      const tr = document.createElement('tr');
      const rowNumber = document.createElement('td');
      rowNumber.className = 'row-number-cell';
      rowNumber.textContent = String(index + 1);
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

    const visibleStart = processedRows.length === 0 ? 0 : 1;
    const visibleEnd = processedRows.length;
    const fetchedCount = state.result.rows.length;
    const sortedBy = state.sortColumn >= 0
      ? ' • Sorted by ' + state.result.columns[state.sortColumn] + ' (' + state.sortDirection + ')'
      : '';

    resultsMeta.textContent =
      'Showing ' + visibleStart.toLocaleString() + '-' + visibleEnd.toLocaleString() +
      ' of ' + fetchedCount.toLocaleString() + ' fetched row(s)' +
      sortedBy;

    copyPageButton.disabled = processedRows.length === 0;
    exportCsvButton.disabled = fetchedCount === 0;
    exportJsonButton.disabled = fetchedCount === 0;
    loadMoreIndicator.hidden = !(state.loadingMore && state.result.hasMore);

    updateHeader();
  }

  function requestMoreRows() {
    if (!state.result || !state.result.hasMore || state.loadingMore) {
      return;
    }

    const offset = state.result.rows.length;
    if (offset === state.lastLoadRequestedOffset) {
      return;
    }

    state.loadingMore = true;
    state.lastLoadRequestedOffset = offset;
    loadMoreIndicator.hidden = false;

    vscode.postMessage({
      type: 'loadMoreRows',
      offset,
    });
  }

  function maybeRequestMoreRows() {
    if (!state.result || !state.result.hasMore || state.loadingMore) {
      return;
    }

    const doc = document.documentElement;
    const remaining = doc.scrollHeight - (window.scrollY + window.innerHeight);
    if (remaining <= 120) {
      requestMoreRows();
    }
  }

  function renderResults(result) {
    const previousRowCount = state.result?.rows?.length || 0;
    state.result = result;
    if (result.rows.length > previousRowCount) {
      state.loadingMore = false;
    }

    summaryRowCount.textContent = result.rowCount.toLocaleString();
    summaryExecutionTime.textContent = result.executionTimeMs + 'ms';
    summaryColumnCount.textContent = result.columns.length.toLocaleString();

    warningBanner.hidden = true;
    warningBanner.textContent = '';
    if (!result.hasMore) {
      state.loadingMore = false;
      loadMoreIndicator.hidden = true;
    }

    renderedSqlPre.classList.remove('is-wrapped');
    toggleWrapButton.innerHTML = '↩<span class="sr-only">Enable line wrap</span>';
    toggleWrapButton.title = 'Enable line wrap';
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
        maybeRequestMoreRows();
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

    renderTable();
  });

  window.addEventListener('scroll', maybeRequestMoreRows, { passive: true });

  copyPageButton.addEventListener('click', () => {
    const rows = getProcessedRows();
    vscode.postMessage({
      type: 'copyToClipboard',
      content: serializeDelimited(rows, '\t'),
      label: 'Copied loaded rows as TSV',
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
    toggleWrapButton.innerHTML = wrapped
      ? '↪<span class="sr-only">Disable line wrap</span>'
      : '↩<span class="sr-only">Enable line wrap</span>';
    toggleWrapButton.title = wrapped ? 'Disable line wrap' : 'Enable line wrap';
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
