# this script will cleanup all temporary files on every state defined in the array
# 1st parameter is the environment (dev|qa|prod)
# 2nd parameter is the region (use1|usw2)

stateCodeArray=( AL AZ CA CO DC FL GA IA ID IL IN KS KY MA MD MI MN MO MS NE NJ NM NV NY OH OR PA SC TN TX UT VA WA WI WV WY )
for i in "${stateCodeArray[@]}"
do
    node ../handler.js --E=$1 --F=$i --R=$2 --C=edwin.json
done
rm ./tmp/*.sh