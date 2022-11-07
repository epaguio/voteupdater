# this script will start the voteupdater on every state defined in the array
# 1st parameter is the environment (dev|qa|prod)
# 2nd parameter is the region (use1|usw2)

# 12:30 
# stateCodeArray=( IN KY )
# 1:00 
# stateCodeArray=( GA SC VA FL OH WV )
# 1:30 
# stateCodeArray=( AL IL MA MD MO MS NJ PA TN DC TX )
# 2:00 
# stateCodeArray=( AZ CO IA KS MI MN NE NM NY WI WY )
# 2:30 
# stateCodeArray=( NV UT )
# 3:00 
# stateCodeArray=( CA ID OR WA )
stateCodeArray=( AL AZ CA CO DC FL GA IA ID IL IN KS KY MA MD MI MN MO MS NE NJ NM NV NY OH OR PA SC TN TX UT VA WA WI WV WY )

for i in "${stateCodeArray[@]}"
do
    echo "cd /Volumes/Seagate\ Backup\ Plus\ Drive/Projects/TFS/EditorialApplications/Elections/dev/feed/ap-el-jviewer/src/tools/voteupdater\nnode handler.js --I=100 --D=60 --N=300 --E=$1 --R=$2 --F=$i" > ./tmp/run$i.sh
    # cat ./tmp/run$i.sh
    chmod +x ./tmp/run$i.sh
    open -a Terminal ./tmp/run$i.sh
    sleep 10
done