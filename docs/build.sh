#!/usr/bin/bash

pdflatex -interaction nonstopmode Rad.tex
biber Rad
pdflatex -interaction nonstopmode Rad.tex
pdflatex -interaction nonstopmode Rad.tex
