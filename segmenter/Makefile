all:
	gcc -Wall -g segmenter.c -o segmenter -lavformat -lavcodec -lavutil -lbz2 -lm -lz -lfaac -lmp3lame -lx264 -lfaad -lpthread
	
clean:
	rm segmenter

install: segmenter
	cp segmenter /usr/local/bin/

uninstall:
	rm /usr/local/bin/segmenter
