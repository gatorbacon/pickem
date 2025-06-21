#!/bin/bash

# Deploy script for GatorBacon Pick'Em Platform
# Usage: ./deploy.sh "Your commit message"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐊 GatorBacon Pick'Em Deployment Script${NC}"
echo "=========================================="

# Check if commit message is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Please provide a commit message${NC}"
    echo "Usage: ./deploy.sh \"Your commit message\""
    exit 1
fi

COMMIT_MESSAGE="$1"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Checking git status...${NC}"
git status --porcelain

# Check if there are any changes to commit
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  No changes to deploy${NC}"
    exit 0
fi

echo -e "${BLUE}📦 Adding all changes...${NC}"
git add .

echo -e "${BLUE}💾 Committing changes...${NC}"
git commit -m "$COMMIT_MESSAGE"

# Check if commit was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Commit failed${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Pushing to GitHub...${NC}"
git push origin main

# Check if push was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Successfully deployed to GitHub!${NC}"
    echo -e "${GREEN}🌐 Vercel will automatically deploy to gatorbacon.com${NC}"
    echo -e "${YELLOW}⏱️  Deployment usually takes 2-3 minutes${NC}"
    echo ""
    echo -e "${BLUE}🔗 Useful links:${NC}"
    echo "   • Live site: https://gatorbacon.com"
    echo "   • GitHub repo: https://github.com/gatorbacon/pickem"
    echo "   • Vercel dashboard: https://vercel.com/dashboard"
else
    echo -e "${RED}❌ Push failed${NC}"
    exit 1
fi 