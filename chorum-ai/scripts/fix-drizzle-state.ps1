# Fix Drizzle state after manual migration
# Run from chorum-ai directory

Write-Host "Fixing Drizzle state..."

# Option 1: Try to regenerate from current schema
Write-Host "Attempting drizzle-kit generate..."
npm run db:generate

if ($LASTEXITCODE -ne 0) {
    Write-Host "Generate failed. Trying introspect..."

    # Option 2: Introspect from database
    npx drizzle-kit introspect
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Both methods failed. Manual steps required:"
    Write-Host "1. Run the SQL in drizzle/manual_0016_zettelkasten.sql via Supabase SQL Editor"
    Write-Host "2. Delete drizzle/meta/_journal.json entry for 0016 if it exists but tables don't"
    Write-Host "3. Run: npm run db:generate"
    Write-Host ""
}

Write-Host "Done."
