@echo off
cd /d "C:\Users\sambobo\OneDrive - Microsoft\Desktop\Claude Code\BoardGame"

echo Checking git status...
git status

echo.
echo Current branch:
git branch

echo.
echo Switching to AgencyCopilot branch...
git checkout AgencyCopilot

echo.
echo Pulling latest changes...
git pull origin AgencyCopilot

echo.
echo Adding changed files...
git add game.js RULEBOOK.md

echo.
echo Committing changes...
git commit -m "Fix character selection button and add comprehensive rulebook

- Fixed syntax error at line 1703 in game.js (removed duplicate code)
- Added error handling to startCharacterSelect and renderCharacterSelect functions
- Made functions explicitly globally accessible via window object
- Created comprehensive RULEBOOK.md with complete game rules and strategy guide
- Added test files for debugging (test_button.html, test_minimal.html, etc.)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

echo.
echo Pushing to GitHub...
git push origin AgencyCopilot

echo.
echo Done! Press any key to exit...
pause
