export interface TableProps {
  headers: string[];
  rows: string[][];
  mono?: number[];
}

export function Table({ headers, rows, mono = [] }: TableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={mono.includes(j) ? 'mono' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
