import { Button } from "@/components/ui/button";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const DataPagination = ({ page, totalPages, onPageChange }: Props) => {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 text-sm text-green-600">
        Page {page} of {totalPages || 1}
      </div>
      <div className="flex items-center justify-end space-x-2">
        <Button
          disabled={page <= 1}
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="border-green-200 text-green-600 hover:bg-green-50"
        >
          Previous
        </Button>
        <Button
          disabled={page >= totalPages}
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="border-green-200 text-green-600 hover:bg-green-50"
        >
          Next
        </Button>
      </div>
    </div>
  );
};
