"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole } from "@/lib/use-role";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, BookOpen, Trash2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import { checkRateLimit } from "@/lib/rate-limit";

export default function BooksPage() {
  const school = useSchool();
  const role = useRole();
  const isPrincipal = role === "principal";
  const books = useQuery(api.books.listBySchool, school ? { schoolId: school._id } : "skip");
  const createBook = useMutation(api.books.create);
  const deleteBook = useMutation(api.books.remove);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [availableCopies, setAvailableCopies] = useState("1");

  if (books === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = books?.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!checkRateLimit("book-create", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!school || !title.trim() || !author.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      const copies = parseInt(availableCopies) || 1;
      await createBook({
        schoolId: school._id,
        title: title.trim(),
        author: author.trim(),
        availableCopies: copies,
        totalCopies: copies,
      });
      toast.success("Book added to inventory");
      setShowModal(false);
      setTitle("");
      setAuthor("");
      setAvailableCopies("1");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[books.create]", error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this book from inventory?")) return;
    try {
      await deleteBook({ id: id as any });
      toast.success("Book removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[books.remove]", error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Books</h1>
          <p className="text-muted-foreground mt-1">{books?.length ?? 0} books in inventory</p>
        </div>
        <div className="flex items-center gap-2">
          {books && books.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  books.map((b) => ({
                    Title: b.title,
                    Author: b.author,
                    "Available Copies": b.availableCopies,
                    "Total Copies": b.totalCopies,
                  })),
                  "books"
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          )}
          {isPrincipal && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Book
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by title or author..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((book) => (
          <Card key={book._id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="h-4 w-4 text-primary shrink-0" />
                    <h3 className="font-semibold truncate">{book.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{book.author}</p>
                  <p className="text-xs text-secondary font-medium mt-2">
                    {book.availableCopies === 1 ? "1 copy" : `${book.availableCopies} copies`} available
                  </p>
                </div>
                {isPrincipal && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(book._id)} className="shrink-0 ml-2">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No books found</p>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Book">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="title">Book Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mathematics Form 1" required />
          </div>
          <div>
            <Label htmlFor="author">Author</Label>
            <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. John Doe" required />
          </div>
          <div>
            <Label htmlFor="copies">Available Copies</Label>
            <Input id="copies" type="number" min="1" value={availableCopies} onChange={(e) => setAvailableCopies(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Book</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
