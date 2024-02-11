total_hours = 1
total_minutes = 24
total_seconds = 2

for chunk in range(10000):
	seconds = 0 if chunk % 2 == 0 else 30
	minutes = chunk // 2
	hours = minutes // 60
	minutes = minutes % 60
	print(f"ffmpeg -i discours.mp3 -ss {hours:02d}:{minutes:02d}:{seconds:02d} -t 00:00:30.0 -c:a copy discours-chunk{chunk:03d}.mp3")
	if hours >= total_hours and minutes >= total_minutes and seconds >= total_seconds:
		break
