import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  AlertCircle,
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Columns3Icon,
  ListFilterIcon,
  PlusIcon,
  TrashIcon,
  XCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { Fragment, useId, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[] | readonly TData[]
  onDelete?: (selectedRows: TData[]) => void
  onAdd?: () => void
  addLabel?: string
  filterColumn?: string
  filterPlaceholder?: string
  renderRowActions?: (row: Row<TData>) => React.ReactNode
  facetedFilters?: {
    column: string
    title: string
    options: { label: string; value: string }[]
  }[]
  className?: string
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode
  getRowCanExpand?: (row: Row<TData>) => boolean
  globalActions?: React.ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onDelete,
  onAdd,
  addLabel = 'Add Item',
  filterColumn,
  filterPlaceholder = 'Filter...',
  facetedFilters,
  className,
  renderSubComponent,
  getRowCanExpand,
  globalActions,
}: DataTableProps<TData, TValue>) {
  const id = useId()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const [rowSelection, setRowSelection] = useState({})

  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const table = useReactTable({
    columns,
    data: data as TData[],
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    getRowCanExpand: getRowCanExpand ?? (renderSubComponent ? () => true : () => false),
    state: {
      columnFilters,
      columnVisibility,
      pagination,
      sorting,
      rowSelection,
      expanded,
    },
  })

  const handleDeleteRows = () => {
    const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
    if (onDelete) {
      onDelete(selectedRows)
    }
    table.resetRowSelection()
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4', className)}>
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {filterColumn && (
            <div className="relative">
              <Input
                aria-label={`Filter by ${filterColumn}`}
                className={cn(
                  'peer min-w-60 ps-9',
                  Boolean(table.getColumn(filterColumn)?.getFilterValue()) && 'pe-9'
                )}
                id={`${id}-input`}
                onChange={(e) => table.getColumn(filterColumn)?.setFilterValue(e.target.value)}
                placeholder={filterPlaceholder}
                ref={inputRef}
                type="text"
                value={(table.getColumn(filterColumn)?.getFilterValue() ?? '') as string}
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                <ListFilterIcon aria-hidden="true" size={16} />
              </div>
              {Boolean(table.getColumn(filterColumn)?.getFilterValue()) && (
                <button
                  aria-label="Clear filter"
                  className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-[color,box-shadow] hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    table.getColumn(filterColumn)?.setFilterValue('')
                    if (inputRef.current) {
                      inputRef.current.focus()
                    }
                  }}
                  type="button"
                >
                  <XCircle aria-hidden="true" size={16} />
                </button>
              )}
            </div>
          )}

          {facetedFilters?.map((filter) => {
            const column = table.getColumn(filter.column)
            if (!column) return null
            const selectedValues = new Set(column.getFilterValue() as string[])
            const facets = column.getFacetedUniqueValues()

            return (
              <Popover key={filter.column}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <ListFilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                    {filter.title}
                    {selectedValues?.size > 0 && (
                      <>
                        <div className="hidden space-x-1 lg:flex">
                          {selectedValues.size > 2 ? (
                            <span className="ml-2 rounded-sm bg-primary px-1 font-normal text-primary-foreground text-xs">
                              {selectedValues.size} selected
                            </span>
                          ) : (
                            filter.options
                              .filter((option) => selectedValues.has(option.value))
                              .map((option) => (
                                <span
                                  key={option.value}
                                  className="ml-2 rounded-sm bg-primary px-1 font-normal text-primary-foreground text-xs"
                                >
                                  {option.label}
                                </span>
                              ))
                          )}
                        </div>
                      </>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <div className="p-2">
                    {filter.options.map((option) => {
                      const isSelected = selectedValues.has(option.value)
                      return (
                        <div key={option.value} className="flex items-center space-x-2 p-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                selectedValues.add(option.value)
                              } else {
                                selectedValues.delete(option.value)
                              }
                              const filterValues = Array.from(selectedValues)
                              column.setFilterValue(filterValues.length ? filterValues : undefined)
                            }}
                          />
                          <span className="text-sm font-medium">{option.label}</span>
                          {facets?.get(option.value) && (
                            <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                              {facets.get(option.value)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {selectedValues.size > 0 && (
                      <>
                        <div className="h-px bg-muted my-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-center text-xs"
                          onClick={() => column.setFilterValue(undefined)}
                        >
                          Clear filters
                        </Button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Columns3Icon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      checked={column.getIsVisible()}
                      className="capitalize"
                      key={column.id}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-3">
          {table.getSelectedRowModel().rows.length > 0 && onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="ml-auto" variant="outline">
                  <TrashIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Delete
                  <span className="-me-1 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] font-medium text-[0.625rem] text-muted-foreground/70">
                    {table.getSelectedRowModel().rows.length}
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <div className="flex flex-col gap-2 max-sm:items-center sm:flex-row sm:gap-4">
                  <div
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border"
                  >
                    <AlertCircle className="opacity-80" size={16} />
                  </div>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete{' '}
                      {table.getSelectedRowModel().rows.length} selected{' '}
                      {table.getSelectedRowModel().rows.length === 1 ? 'row' : 'rows'}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteRows}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {onAdd && (
            <Button className="ml-auto" variant="outline" onClick={onAdd}>
              <PlusIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
              {addLabel}
            </Button>
          )}
          {globalActions}
        </div>
      </div>

      <Table
        className="table-fixed"
        containerClassName="flex-1 min-h-0 rounded-md border bg-background"
        showScrollbar
        style={{ minWidth: '100%', width: table.getTotalSize() }}
      >
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_0_var(--border)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent border-none" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead className="h-11 whitespace-nowrap" key={header.id}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(
                            header.column.getCanSort() &&
                              'flex h-full cursor-pointer select-none items-center justify-between gap-2'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (
                              header.column.getCanSort() &&
                              (e.key === 'Enter' || e.key === ' ')
                            ) {
                              e.preventDefault()
                              header.column.getToggleSortingHandler()?.(e)
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                          role="button"
                        >
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {{
                            asc: (
                              <ChevronUpIcon
                                aria-hidden="true"
                                className="shrink-0 opacity-60"
                                size={16}
                              />
                            ),
                            desc: (
                              <ChevronDownIcon
                                aria-hidden="true"
                                className="shrink-0 opacity-60"
                                size={16}
                              />
                            ),
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      ) : (
                        <span className="truncate">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && 'selected'}
                    className={cn(
                      renderSubComponent && row.getCanExpand() && 'cursor-pointer'
                    )}
                    onClick={() => {
                      if (renderSubComponent && row.getCanExpand()) {
                        row.toggleExpanded()
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell className="last:py-0 truncate" key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && renderSubComponent && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={row.getVisibleCells().length} className="p-4">
                        {renderSubComponent({ row })}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={columns.length}>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

      <div className="flex flex-none items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <Label className="max-sm:sr-only" htmlFor={id}>
            Rows per page
          </Label>
          <Select
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
            value={table.getState().pagination.pageSize.toString()}
          >
            <SelectTrigger className="w-fit whitespace-nowrap" id={id}>
              <SelectValue placeholder="Select number of results" />
            </SelectTrigger>
            <SelectContent className="[&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2 [&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8">
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex grow justify-end whitespace-nowrap text-muted-foreground text-sm">
          <p aria-live="polite" className="whitespace-nowrap text-muted-foreground text-sm">
            <span className="text-foreground">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
              {Math.min(
                Math.max(
                  table.getState().pagination.pageIndex * table.getState().pagination.pageSize +
                    table.getState().pagination.pageSize,
                  0
                ),
                table.getRowCount()
              )}
            </span>{' '}
            of <span className="text-foreground">{table.getRowCount().toString()}</span>
          </p>
        </div>

        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  aria-label="Go to first page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.firstPage()}
                  size="icon"
                  variant="outline"
                >
                  <ChevronFirstIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  aria-label="Go to previous page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                  size="icon"
                  variant="outline"
                >
                  <ChevronLeftIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  aria-label="Go to next page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                  size="icon"
                  variant="outline"
                >
                  <ChevronRightIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  aria-label="Go to last page"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.lastPage()}
                  size="icon"
                  variant="outline"
                >
                  <ChevronLastIcon aria-hidden="true" size={16} />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  )
}

export function createExpanderColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: 'expander',
    header: () => null,
    size: 40,
    cell: ({ row }) => {
      return row.getCanExpand() ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            row.toggleExpanded()
          }}
          className="p-1 hover:bg-muted rounded"
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ) : null
    },
  }
}
