import { ReactNode, useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandDialog,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaQuery } from "../hooks/use-media-query";

interface CommandSelectProps {
  options: Array<{
    id: string;
    value: string;
    label: string;
    logo?: ReactNode;
  }>;
  onSelect: (value: string) => void;
  onSearch?: (value: string) => void;
  value: string;
  placeholder?: string;
  isSearchable?: boolean;
  className?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  logo?: ReactNode;
}

export function CommandSelect({
  options,
  onSelect,
  onSearch,
  value,
  placeholder = "Select an option...",
  isSearchable = true,
  className,
  dialogTitle,
  dialogDescription,
}: CommandSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (onSearch) {
      const timer = setTimeout(() => {
        onSearch(searchValue);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchValue, onSearch]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setOpen(false);
    setDialogOpen(false);
    setSearchValue("");
  };

  const renderContent = () => (
    <>
      {isSearchable && (
        <CommandInput
          placeholder="Search..."
          value={searchValue}
          onValueChange={setSearchValue}
          className="h-9"
        />
      )}
      <CommandList>
        <CommandEmpty>No options found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.id}
              value={option.value}
              onSelect={() => handleSelect(option.value)}
              className="cursor-pointer"
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4 flex-shrink-0",
                  value === option.value ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex items-center gap-2 w-full">
                {option.logo}
                <span className="truncate">{option.label}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );

  

  if (isMobile) {
    return (
      <>
        <Button
          variant="outline"
          onClick={() => setDialogOpen(true)}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2">
            {selectedOption?.logo || null}
            {selectedOption ? (
              <span className="truncate">{selectedOption.label}</span>
            ) : (
              <span className="text-muted-foreground">
                {placeholder}
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <CommandDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={dialogTitle || "Select an option"}
          description={dialogDescription || "Search and select an option from the list"}
        >
          <Command className="rounded-lg border shadow-md">
            <div className="p-2">
              {renderContent()}
            </div>
          </Command>
        </CommandDialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2">
            {selectedOption?.logo || null}
            {selectedOption ? (
              <span className="truncate">{selectedOption.label}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command 
          filter={(value, search) => {
            if (search === "") return 1;
            const option = options.find((opt) => opt.value === value);
            return option?.label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          {renderContent()}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
